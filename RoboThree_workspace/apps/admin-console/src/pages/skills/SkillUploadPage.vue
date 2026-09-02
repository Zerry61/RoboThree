<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">技能管理</p>
      <h2>上传企业技能包</h2>
      <p>选择技能包并发送到技能生命周期服务。浏览器不解压、不解析包内容，也不读取技能说明正文。</p>
      <a class="inventory-back-link" href="#/skills" aria-label="返回技能审核列表">返回技能审核</a>
    </header>
    <InlineNotice>支持 ZIP、RAR、TAR.GZ、TGZ，最大 200 MiB。解析、校验和草稿创建结果以服务端返回为准。</InlineNotice>
    <section class="admin-form-section" aria-label="选择技能包">
      <label for="skill-archive-file">技能包</label>
      <input id="skill-archive-file" type="file" accept=".zip,.rar,.tar.gz,.tgz" :disabled="uploading" @change="onFileChange" />
      <p v-if="fileError" class="field-error">{{ fileError }}</p>
      <dl v-if="fileInfo" class="inventory-detail">
        <dt>文件名</dt><dd>{{ fileInfo.name }}</dd>
        <dt>文件大小</dt><dd>{{ fileInfo.sizeLabel }}</dd>
        <dt>格式</dt><dd>{{ fileInfo.formatLabel }}</dd>
      </dl>
      <AdminButton :disabled="selectedFile === undefined || fileError !== '' || uploading" :loading="uploading" label="上传技能包" @click="upload">{{ uploading ? '上传中' : '上传并解析' }}</AdminButton>
      <div v-if="uploading" class="upload-progress" role="status" aria-live="polite">
        <progress aria-label="技能包上传进度"></progress>
        <span>上传请求发送中，服务端解析结果返回前请勿重复提交。</span>
      </div>
    </section>
    <InlineNotice v-if="operationNotice">{{ operationNotice }}</InlineNotice>
    <InlineNotice v-if="operationError">{{ operationError }}</InlineNotice>
    <section v-if="receiptSkillId" class="admin-form-section" aria-label="草稿入口">
      <h3>草稿已返回</h3>
      <p>服务端已返回技能草稿标识，请进入草稿页查看安全包事实并继续编辑。</p>
      <a class="admin-link-button" :href="`#/skills/drafts/${receiptSkillId}`" aria-label="进入企业技能草稿">进入企业技能草稿</a>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { formatBytes, presentSkillLifecycleError } from '../../presentation/skill-lifecycle-presentation';
import AdminButton from '../../components/ui/AdminButton.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import type { UploadEnterpriseSkillPackageCommand } from '@robothree/contracts/skill-lifecycle/v1alpha1';

type SkillArchiveFormat = UploadEnterpriseSkillPackageCommand['upload']['archiveFormat'];

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const selectedFile = ref<File>();
const archiveFormat = ref<SkillArchiveFormat>();
const fileError = ref('');
const uploading = ref(false);
const operationNotice = ref('');
const operationError = ref('');
const receiptSkillId = ref('');

const fileInfo = computed(() => selectedFile.value === undefined || archiveFormat.value === undefined ? undefined : {
  name: selectedFile.value.name,
  sizeLabel: formatBytes(selectedFile.value.size),
  formatLabel: presentArchiveFormat(archiveFormat.value)
});

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  selectedFile.value = file;
  receiptSkillId.value = '';
  operationNotice.value = '';
  operationError.value = '';
  fileError.value = '';
  archiveFormat.value = undefined;
  if (file === undefined) return;
  const detected = detectArchiveFormat(file.name);
  if (detected === undefined) {
    fileError.value = '请上传 ZIP、RAR、TAR.GZ 或 TGZ 格式的技能包。';
    return;
  }
  if (file.size <= 0) {
    fileError.value = '技能包不能为空。';
    return;
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    fileError.value = '技能包超过 200 MiB，请重新选择。';
    return;
  }
  archiveFormat.value = detected;
}

async function upload(): Promise<void> {
  const file = selectedFile.value;
  const format = archiveFormat.value;
  if (file === undefined || format === undefined || fileError.value !== '' || uploading.value) return;
  uploading.value = true;
  operationNotice.value = '';
  operationError.value = '';
  try {
    const digest = await digestFile(file);
    const receipt = await getAdminAdapter().uploadEnterpriseSkillPackage({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'upload_enterprise_skill_package',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      upload: {
        archiveFileName: file.name,
        archiveFormat: format,
        mediaType: file.type || mediaTypeForFormat(format),
        byteLength: file.size,
        archiveDigest: digest
      }
    }, file);
    receiptSkillId.value = receipt.skillId;
    operationNotice.value = '技能包上传请求已返回，草稿事实以服务端解析结果为准。';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    operationError.value = presentSkillLifecycleError(apiError ?? {});
  } finally {
    uploading.value = false;
  }
}

function detectArchiveFormat(name: string): SkillArchiveFormat | undefined {
  const value = name.toLowerCase();
  if (value.endsWith('.tar.gz')) return 'tar_gz';
  if (value.endsWith('.tgz')) return 'tgz';
  if (value.endsWith('.zip')) return 'zip';
  if (value.endsWith('.rar')) return 'rar';
  return undefined;
}

function presentArchiveFormat(value: SkillArchiveFormat): string {
  switch (value) {
    case 'zip': return 'ZIP';
    case 'rar': return 'RAR';
    case 'tar_gz': return 'TAR.GZ';
    case 'tgz': return 'TGZ';
  }
}

function mediaTypeForFormat(value: SkillArchiveFormat): string {
  switch (value) {
    case 'zip': return 'application/zip';
    case 'rar': return 'application/vnd.rar';
    case 'tar_gz':
    case 'tgz':
      return 'application/gzip';
  }
}

async function digestFile(file: File): Promise<`sha256:${string}`> {
  if (crypto.subtle === undefined) throw new AdminApiError('skilllifecycle.service_unavailable', '当前浏览器暂不支持安全上传校验');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
</script>
