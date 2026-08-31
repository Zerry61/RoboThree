<template>
  <section
    class="tasks-page"
    :class="{ 'tasks-page--conversation': selectedTaskId !== '' }"
    aria-labelledby="tasks-title"
  >
    <header v-if="selectedTaskId === ''" class="tasks-page__header">
      <div>
        <h2 id="tasks-title">任务</h2>
        <p class="tasks-page__eyebrow">查看任务对话、成果和执行过程。</p>
      </div>
      <span class="tasks-page__eyebrow">{{ loading ? "正在同步任务…" : "" }}</span>
    </header>

    <R3InlineNotice v-if="error" tone="danger" title="任务操作失败">
      {{ error }}
    </R3InlineNotice>
    <R3InlineNotice v-else-if="notice" tone="success" title="任务操作完成">
      {{ notice }}
    </R3InlineNotice>

    <section v-if="selectedTaskId === ''" class="tasks-page__summary" aria-label="任务统计">
      <R3Card v-for="metric in summaryMetrics" :key="metric.label">
        <div class="tasks-page__metric">
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.label }}</span>
        </div>
      </R3Card>
    </section>

    <div class="tasks-page__workspace" :class="{ 'tasks-page__workspace--detail': selectedTaskId !== '' }">
      <R3Card v-if="selectedTaskId === ''">
        <template #header>
          <div class="tasks-page__toolbar">
            <R3SearchField
              v-model="searchQuery"
              placeholder="搜索任务"
              :disabled="loading"
            />
            <R3Select
              v-model="statusFilter"
              label="状态"
              :options="statusOptions"
              :disabled="loading"
            />
            <R3Button variant="secondary" :disabled="busy" @click="void refresh()">
              刷新
            </R3Button>
          </div>
        </template>

        <div v-if="loading" class="tasks-page__loading">
          <R3Skeleton />
          <R3Skeleton />
          <R3Skeleton />
        </div>

        <R3EmptyState
          v-else-if="taskView.items.length === 0"
          :title="taskView.emptyReason === 'no_tasks' ? '暂无任务' : '没有匹配任务'"
          :description="taskView.emptyReason === 'no_tasks'
            ? '从工作台提交任务后会显示在这里。'
            : '调整搜索词或状态筛选。'"
        />

        <ul v-else class="tasks-page__list" aria-label="任务列表">
          <li
            v-for="item in taskView.items"
            :key="item.id"
            class="tasks-page__item"
            :class="{
              'tasks-page__item--pinned': item.pinned,
              'tasks-page__item--selected': selectedTaskId === item.task?.taskId,
            }"
          >
            <div class="tasks-page__item-main">
              <div class="tasks-page__item-title">
                <strong>{{ item.title }}</strong>
                <R3Tag v-if="item.pinned" tone="primary">本次视图置顶</R3Tag>
              </div>
              <div class="tasks-page__item-meta">
                <R3StatusBadge :tone="item.statusTone">{{ item.statusLabel }}</R3StatusBadge>
                <span>{{ formatTime(item.updatedAt) }}</span>
                <span v-if="item.task?.failureSummary">{{ item.task.failureSummary }}</span>
              </div>
              <p v-if="item.deleteBlockReason" class="tasks-page__delete-note">
                {{ item.deleteBlockReason }}
              </p>
            </div>
            <div class="tasks-page__actions" aria-label="任务操作">
              <R3Button
                variant="secondary"
                :disabled="busy"
                data-task-action="open"
                @click="void openTask(item)"
              >
                打开
              </R3Button>
              <R3Button variant="secondary" :disabled="busy || item.task === undefined" @click="togglePin(item)">
                {{ item.pinned ? "取消置顶" : "置顶" }}
              </R3Button>
              <R3Button
                variant="secondary"
                :disabled="busy"
                data-task-action="rename"
                @click="showRenameDialog(item)"
              >
                重命名
              </R3Button>
              <R3Button
                v-if="item.canCancel"
                variant="secondary"
                :disabled="busy"
                @click="showCancelDialog(item)"
              >
                停止
              </R3Button>
              <R3Button
                variant="danger"
                :disabled="busy || !item.canDelete"
                @click="showDeleteDialog(item)"
              >
                删除
              </R3Button>
            </div>
          </li>
        </ul>
      </R3Card>

      <section v-if="selectedTaskId !== ''" class="tasks-page__conversation-shell">
        <header class="tasks-page__conversation-header">
          <div class="tasks-page__conversation-heading">
            <R3IconButton label="返回任务列表" @click="closeTaskDetail">←</R3IconButton>
            <div>
              <h2 id="tasks-title">{{ selectedSessionTitle }}</h2>
              <p v-if="selectedDetailView">{{ selectedDetailView.goalSummary }}</p>
            </div>
          </div>
          <div class="tasks-page__conversation-header-actions">
            <R3Button
              v-if="sidePanelCollapsed"
              variant="secondary"
              data-side-panel-restore
              @click="sidePanelCollapsed = false"
            >
              展开成果
            </R3Button>
          </div>
        </header>

        <div v-if="detailLoading && selectedDetailView === undefined" class="tasks-page__loading tasks-page__conversation-loading">
          <R3Skeleton />
          <R3Skeleton />
        </div>

        <R3EmptyState
          v-else-if="selectedDetailView === undefined"
          title="任务详情不可用"
          description="刷新任务列表后再试。"
        />

        <div v-else class="tasks-page__detail" aria-live="polite">
          <R3InlineNotice
            v-if="selectedDetailView.status.guidance"
            tone="warning"
            title="任务状态"
          >
            {{ selectedDetailView.status.guidance }}
          </R3InlineNotice>
          <div class="tasks-page__detail-actions" aria-label="任务详情操作">
            <R3Button
              v-if="selectedDetailView.status.controls.canCancel"
              variant="secondary"
              :disabled="busy"
              @click="showDetailCancelDialog()"
            >
              停止
            </R3Button>
            <R3Button
              v-if="selectedDetailView.status.controls.canRetry"
              variant="secondary"
              :disabled="busy"
              @click="void controlSelectedTask('retry_task')"
            >
              重试
            </R3Button>
            <R3Button
              v-if="selectedDetailView.status.controls.canContinue"
              variant="secondary"
              :disabled="busy"
              @click="void controlSelectedTask('continue_task')"
            >
              继续
            </R3Button>
            <R3Button
              v-if="selectedDetailView.status.controls.canProvideInput"
              variant="primary"
              :disabled="busy"
              @click="showProvideInputDialog()"
            >
              补充输入
            </R3Button>
          </div>

          <div
            class="tasks-page__detail-body"
            :class="{ 'tasks-page__detail-body--collapsed': sidePanelCollapsed }"
          >
            <div class="tasks-page__detail-main">
              <section
                ref="conversationStream"
                class="tasks-page__conversation-stream"
                aria-live="polite"
                aria-label="任务对话"
              >
                <h3 class="sr-only">任务对话</h3>
                <R3EmptyState
                  v-if="selectedDetailView.messages.length === 0"
                  title="正在准备回复"
                  description="RoboThree 的回复会在这里持续显示。"
                />
                <ul v-else class="tasks-page__messages">
                  <li
                    v-for="message in selectedDetailView.messages"
                    :key="message.id"
                    class="tasks-page__message"
                    :class="message.presentation.roleClass"
                  >
                    <span class="tasks-page__message-avatar" aria-hidden="true">
                      {{ message.presentation.avatar }}
                    </span>
                    <div class="tasks-page__message-body">
                      <header><strong>{{ message.presentation.authorName }}</strong></header>
                      <p>{{ message.presentation.content }}</p>
                    </div>
                  </li>
                </ul>
              </section>

              <section
                v-if="selectedDetailView.confirmations.length > 0"
                class="tasks-page__detail-section tasks-page__confirmation-section"
                aria-label="用户确认"
              >
                <h4>需要确认</h4>
                <ul class="tasks-page__cards">
                  <li
                    v-for="confirmation in selectedDetailView.confirmations"
                    :key="confirmation.id"
                    class="tasks-page__subcard"
                  >
                    <div class="tasks-page__subcard-header">
                      <strong>{{ confirmation.presentation.title }}</strong>
                      <R3StatusBadge tone="warning">
                        {{ confirmation.presentation.statusLabel }}
                      </R3StatusBadge>
                    </div>
                    <p>{{ confirmation.presentation.reasonSummary }}</p>
                    <p>{{ confirmation.presentation.riskSummary }}</p>
                    <dl>
                      <template
                        v-for="meta in confirmation.presentation.meta"
                        :key="meta.label"
                      >
                        <dt>{{ meta.label }}</dt>
                        <dd>{{ meta.value }}</dd>
                      </template>
                    </dl>
                    <div v-if="confirmation.canDecide" class="tasks-page__detail-actions">
                      <R3Button
                        variant="primary"
                        :disabled="busy"
                        data-confirmation-action="confirmed"
                        @click="showConfirmationDialog(confirmation, 'confirmed')"
                      >
                        允许
                      </R3Button>
                      <R3Button
                        variant="danger"
                        :disabled="busy"
                        data-confirmation-action="rejected"
                        @click="showConfirmationDialog(confirmation, 'rejected')"
                      >
                        拒绝
                      </R3Button>
                    </div>
                  </li>
                </ul>
              </section>

              <form
                class="tasks-page__conversation-composer"
                aria-label="发送消息"
                @submit.prevent="void submitConversationTurn()"
              >
                <R3Textarea
                  v-model="conversationDraft"
                  label="消息"
                  placeholder="描述你想继续完成的内容…"
                  :rows="3"
                  :disabled="conversationSubmitting"
                  data-conversation-composer
                  @keydown="handleConversationKeydown"
                />
                <div class="tasks-page__conversation-composer-footer">
                  <span v-if="!conversationTurnReady">RoboThree 正在回复</span>
                  <R3Button
                    type="submit"
                    variant="primary"
                    :disabled="!conversationCanSubmit"
                    data-conversation-send
                    aria-label="发送消息"
                  >
                    ↑
                  </R3Button>
                </div>
              </form>

            </div>

            <aside
              v-if="!sidePanelCollapsed"
              class="tasks-page__side-panel"
              :class="{
                'tasks-page__side-panel--collapsed': sidePanelCollapsed,
                'tasks-page__side-panel--fullscreen': sidePanelFullscreen,
              }"
              aria-label="任务右侧面板"
            >
              <header class="tasks-page__side-header">
                <label class="tasks-page__view-select">
                  <span class="sr-only">面板内容</span>
                  <select v-model="sidePanelTab" aria-label="面板内容">
                    <option value="overview">概览</option>
                    <option value="workspace">工作空间文件</option>
                  </select>
                </label>
                <div class="tasks-page__side-actions">
                  <R3IconButton
                    label="在文件夹中查看任务工作空间"
                    :disabled="!workspaceCanReveal || workspaceState.revealBusy"
                    @click="void revealTaskWorkspaceLocation()"
                  >📁</R3IconButton>
                  <R3IconButton
                    :label="sidePanelFullscreen ? '退出软件内全屏' : '软件内全屏'"
                    data-side-panel-fullscreen
                    @click="sidePanelFullscreen = !sidePanelFullscreen"
                  >{{ sidePanelFullscreen ? "↙" : "↗" }}</R3IconButton>
                  <R3IconButton
                    label="收起操作区"
                    data-side-panel-collapse
                    @click="sidePanelCollapsed = true"
                  >»</R3IconButton>
                </div>
              </header>

                <section
                  v-if="sidePanelTab === 'overview'"
                  class="tasks-page__side-section"
                  aria-label="成果概览"
                >
                  <div class="tasks-page__artifact-tabs" aria-label="活动成果标签">
                    <button
                      v-for="artifact in artifactTabs"
                      :key="artifact.id"
                      type="button"
                      class="tasks-page__artifact-tab"
                      :class="{ 'tasks-page__artifact-tab--active': artifact.id === activeArtifactId }"
                      @click="activeArtifactId = artifact.id"
                    >
                      <span>{{ artifact.presentation.title }}</span>
                      <span
                        role="button"
                        tabindex="0"
                        aria-label="关闭成果标签"
                        @keydown.enter.stop.prevent="closeArtifactTab(artifact.id)"
                        @keydown.space.stop.prevent="closeArtifactTab(artifact.id)"
                        @click.stop="closeArtifactTab(artifact.id)"
                      >
                        ×
                      </span>
                    </button>
                  </div>

                  <R3EmptyState
                    v-if="selectedDetailView.artifacts.length === 0"
                    title="暂无成果"
                    description="工具生成的文档、表格或预览会显示在这里。"
                  />

                  <template v-else>
                    <ul class="tasks-page__artifact-list" aria-label="成果列表">
                      <li
                        v-for="artifact in selectedDetailView.artifacts"
                        :key="artifact.id"
                        class="tasks-page__artifact-card"
                        :class="`tasks-page__artifact-card--${artifact.presentation.tone}`"
                      >
                        <button
                          type="button"
                          class="tasks-page__artifact-open"
                          data-artifact-action="open-tab"
                          @click="openArtifactTab(artifact)"
                        >
                          <strong>{{ artifact.presentation.title }}</strong>
                          <span>{{ artifact.presentation.summary }}</span>
                        </button>
                        <R3Tag tone="neutral">{{ artifact.presentation.kindLabel }}</R3Tag>
                        <R3StatusBadge :tone="artifact.presentation.tone === 'available'
                          ? 'success'
                          : artifact.presentation.tone === 'deleted'
                            ? 'neutral'
                            : 'warning'">
                          {{ artifact.presentation.stateLabel }}
                        </R3StatusBadge>
                      </li>
                    </ul>

                    <article
                      v-if="activeArtifact"
                      class="tasks-page__artifact-detail"
                      aria-label="当前成果"
                    >
                      <header>
                        <strong>{{ activeArtifact.presentation.title }}</strong>
                        <span>{{ activeArtifact.presentation.kindLabel }}</span>
                      </header>
                      <p>{{ activeArtifact.presentation.summary }}</p>
                      <dl>
                        <template
                          v-for="meta in activeArtifact.presentation.meta"
                          :key="meta.label"
                        >
                          <dt>{{ meta.label }}</dt>
                          <dd>{{ meta.value }}</dd>
                        </template>
                      </dl>
                      <div class="tasks-page__artifact-actions">
                        <R3Button
                          v-if="activeArtifact.canPreviewText"
                          variant="secondary"
                          :disabled="busy"
                          data-artifact-action="preview-text"
                          @click="void loadArtifactPreview(activeArtifact, 'text')"
                        >
                          文本
                        </R3Button>
                        <R3Button
                          v-if="activeArtifact.canPreviewText"
                          variant="secondary"
                          :disabled="busy"
                          data-artifact-action="preview-markdown"
                          @click="void loadArtifactPreview(activeArtifact, 'markdown')"
                        >
                          Markdown
                        </R3Button>
                        <R3Button
                          v-if="activeArtifact.canPreviewHtml"
                          variant="secondary"
                          :disabled="busy"
                          data-artifact-action="preview-html"
                          @click="void startHtmlPreview(activeArtifact)"
                        >
                          HTML
                        </R3Button>
                        <R3Button
                          v-if="activeArtifact.canOpenLocation"
                          variant="secondary"
                          :disabled="busy"
                          data-artifact-action="open-location"
                          @click="void openArtifactLocation(activeArtifact)"
                        >
                          打开本地文件夹
                        </R3Button>
                        <R3Button
                          v-if="activeArtifact.canExport"
                          variant="secondary"
                          :disabled="busy"
                          data-artifact-action="export"
                          @click="void exportArtifact(activeArtifact)"
                        >
                          导出
                        </R3Button>
                        <R3Button
                          variant="secondary"
                          :disabled="busy || activeArtifact.source.lifecycle.deleted"
                          data-artifact-action="pin"
                          @click="void setArtifactLifecycle(activeArtifact, {
                            pinned: !activeArtifact.source.lifecycle.pinned,
                          })"
                        >
                          {{ activeArtifact.source.lifecycle.pinned ? "取消固定" : "固定" }}
                        </R3Button>
                        <R3Button
                          variant="secondary"
                          :disabled="busy || activeArtifact.source.lifecycle.deleted"
                          data-artifact-action="dismiss"
                          @click="void setArtifactLifecycle(activeArtifact, {
                            dismissed: !activeArtifact.source.lifecycle.dismissed,
                          })"
                        >
                          {{ activeArtifact.source.lifecycle.dismissed ? "恢复显示" : "隐藏" }}
                        </R3Button>
                      </div>
                    </article>

                    <section
                      v-if="artifactPreview"
                      class="tasks-page__preview"
                      aria-label="成果预览"
                    >
                      <template v-if="artifactPreview.status === 'loading'">
                        <strong>正在加载预览</strong>
                        <p>预览内容会在加载完成后显示。</p>
                      </template>
                      <template v-else-if="artifactPreview.kind === 'error'">
                        <strong>预览不可用</strong>
                        <p>{{ artifactPreview.message }}</p>
                      </template>
                      <template v-else-if="artifactPreview.kind === 'html'">
                        <iframe
                          v-if="artifactPreview.status === 'ready'"
                          :src="artifactPreview.preview.previewUrl"
                          sandbox=""
                          referrerpolicy="no-referrer"
                          title="HTML 成果预览"
                        />
                      </template>
                      <template v-else-if="artifactPreview.status === 'ready'">
                        <div class="tasks-page__preview-meta">
                          <R3Tag tone="neutral">{{ artifactPreview.preview.mode }}</R3Tag>
                          <R3Tag v-if="artifactPreview.preview.truncated" tone="warning">
                            已截断
                          </R3Tag>
                        </div>
                        <div class="tasks-page__preview-blocks">
                          <template
                            v-for="(block, index) in artifactPreview.preview.blocks"
                            :key="`${block.kind}:${index}`"
                          >
                            <h5 v-if="block.kind === 'heading'">{{ block.text }}</h5>
                            <p v-else-if="block.kind === 'paragraph'">{{ block.text }}</p>
                            <p v-else-if="block.kind === 'list_item'">• {{ block.text }}</p>
                            <pre v-else-if="block.kind === 'code'">{{ block.text }}</pre>
                            <div v-else class="tasks-page__preview-row">
                              <span
                                v-for="(cell, cellIndex) in block.cells"
                                :key="cellIndex"
                              >
                                {{ cell }}
                              </span>
                            </div>
                          </template>
                        </div>
                      </template>
                    </section>
                    <R3InlineNotice
                      v-else-if="activeArtifact && !activeArtifact.canPreviewText && !activeArtifact.canPreviewHtml"
                      tone="info"
                      title="此文件暂不支持页面内预览"
                    >
                      你仍可在文件夹中查看或导出该成果。
                    </R3InlineNotice>
                  </template>

                </section>

                <section
                  v-else
                  class="tasks-page__side-section"
                  aria-label="工作空间文件"
                >
                  <div class="tasks-page__workspace-browser-header">
                    <div>
                      <strong>工作空间文件</strong>
                      <p>仅展示任务锁定工作空间中的安全文件元数据。</p>
                    </div>
                    <div class="tasks-page__workspace-browser-actions">
                      <R3Button
                        variant="secondary"
                        :disabled="workspaceState.status === 'loading' || selectedTaskId === ''"
                        data-workspace-action="refresh"
                        @click="void loadWorkspaceRoot()"
                      >
                        刷新
                      </R3Button>
                      <R3Button
                        variant="secondary"
                        :disabled="!workspaceCanReveal || workspaceState.revealBusy"
                        data-workspace-action="reveal-root"
                        @click="void revealTaskWorkspaceLocation()"
                      >
                        打开工作空间位置
                      </R3Button>
                    </div>
                  </div>

                  <R3InlineNotice
                    v-if="workspaceState.status === 'idle'"
                    tone="info"
                    :title="workspaceState.messageTitle"
                  >
                    {{ workspaceState.messageDescription }}
                  </R3InlineNotice>

                  <div v-else-if="workspaceState.status === 'loading'" class="tasks-page__loading">
                    <R3Skeleton />
                    <R3Skeleton />
                    <R3Skeleton />
                  </div>

                  <R3InlineNotice
                    v-else-if="workspaceState.status === 'permission_denied'
                      || workspaceState.status === 'unavailable'
                      || workspaceState.status === 'error'"
                    :tone="workspaceMessageTone"
                    :title="workspaceState.messageTitle"
                  >
                    {{ workspaceState.messageDescription }}
                  </R3InlineNotice>

                  <template v-else>
                    <R3InlineNotice
                      v-if="workspaceState.messageTitle"
                      tone="info"
                      :title="workspaceState.messageTitle"
                    >
                      {{ workspaceState.messageDescription }}
                    </R3InlineNotice>

                    <nav
                      class="tasks-page__workspace-breadcrumb"
                      aria-label="工作空间文件路径"
                    >
                      <button
                        v-for="(item, index) in workspaceState.trail"
                        :key="`${item.parentEntryId ?? 'root'}:${index}`"
                        type="button"
                        :aria-current="index === workspaceState.trail.length - 1 ? 'page' : undefined"
                        @click="void openWorkspaceTrail(item, index)"
                      >
                        {{ item.label }}
                      </button>
                    </nav>

                    <R3EmptyState
                      v-if="workspaceState.status === 'empty'"
                      title="当前目录为空"
                      description="没有可展示的文件或文件夹。"
                    />

                    <ul
                      v-else
                      class="tasks-page__workspace-entries"
                      aria-label="工作空间文件列表"
                    >
                      <li
                        v-for="entry in workspaceState.directory?.entries ?? []"
                        :key="entry.id"
                        class="tasks-page__workspace-entry"
                        :data-workspace-kind="entry.kind"
                      >
                        <button
                          v-if="entry.navigable"
                          type="button"
                          class="tasks-page__workspace-entry-button"
                          data-workspace-action="open-directory"
                          @click="void openWorkspaceDirectory(entry)"
                        >
                          <span>{{ entry.displayName }}</span>
                          <small>{{ entry.kindLabel }} · {{ entry.meta }}</small>
                        </button>
                        <div v-else class="tasks-page__workspace-entry-static">
                          <span>{{ entry.displayName }}</span>
                          <small>
                            {{ entry.kindLabel }} · {{ entry.unavailableReason ?? entry.meta }}
                          </small>
                        </div>
                      </li>
                    </ul>

                    <R3InlineNotice
                      v-if="workspaceState.directory?.truncated"
                      tone="info"
                      title="目录较长"
                    >
                      仅显示当前页文件元数据，可继续加载下一页。
                    </R3InlineNotice>

                    <R3Button
                      v-if="workspaceState.nextCursor"
                      variant="secondary"
                      :disabled="workspaceState.loadingMore"
                      data-workspace-action="load-more"
                      @click="void loadMoreWorkspaceEntries()"
                    >
                      {{ workspaceState.loadingMore ? "加载中" : "加载更多" }}
                    </R3Button>
                  </template>
                </section>
            </aside>
          </div>
        </div>
      </section>
    </div>

    <R3Modal
      :open="dialog !== undefined"
      :title="dialogTitle"
      @close="closeDialog"
    >
      <template v-if="dialog?.type === 'rename'">
        <R3Input v-model="dialog.title" label="任务名称" />
      </template>
      <template v-else-if="dialog?.type === 'provide_input'">
        <R3Textarea
          v-model="dialog.input"
          label="补充输入"
          placeholder="说明任务下一步需要的信息"
          :rows="5"
        />
      </template>
      <template v-else-if="dialog?.type === 'confirmation'">
        <p>{{ dialog.confirmation.presentation.reasonSummary }}</p>
        <p>{{ dialog.confirmation.presentation.riskSummary }}</p>
        <p>确认后只允许执行卡片中描述的这一项操作。</p>
      </template>
      <template v-else-if="dialog?.type === 'delete'">
        <p>删除任务“{{ dialog.item.title }}”？任务消息将被永久删除且无法恢复。</p>
        <p>任务产生的成果文件和工作空间文件不会被删除。</p>
      </template>
      <template v-else-if="dialog?.type === 'cancel'">
        <p>确定停止这个任务吗？</p>
      </template>
      <template #footer>
        <R3Button variant="secondary" :disabled="busy" @click="closeDialog">
          取消
        </R3Button>
        <R3Button
          :variant="dialog?.type === 'delete' || dialog?.type === 'confirmation' && dialog.decision === 'rejected'
            ? 'danger'
            : 'primary'"
          :disabled="busy"
          data-dialog-confirm
          @click="void confirmDialog()"
        >
          {{ dialogConfirmLabel }}
        </R3Button>
      </template>
    </R3Modal>
  </section>
</template>

<script setup lang="ts">
import type {
  ArtifactHtmlPreviewProjection,
  ArtifactPreviewMode,
  ConversationSnapshot,
  TaskDetailProjection,
} from "@robothree/contracts";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3IconButton,
  R3Input,
  R3InlineNotice,
  R3Modal,
  R3SearchField,
  R3Select,
  R3Skeleton,
  R3StatusBadge,
  R3Tag,
  R3Textarea,
} from "../../components/ui";
import {
  desktopTaskPinStore,
  taskPinStoreKey,
  type TaskPinStore,
} from "../../app/task-pin-store.js";
import {
  conversationSelection,
  rememberConversationSelection,
} from "../../app/conversation-selection-store.js";
import {
  DesktopTasksAdapterError,
  desktopTasksAdapter,
  tasksAdapterKey,
  type TasksAdapter,
  type TasksAdapterData,
} from "../../adapters/tasks-adapter.js";
import {
  desktopWorkbenchAdapter,
  DesktopWorkbenchAdapterError,
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../../adapters/workbench-adapter.js";
import {
  desktopTaskWorkspaceAdapter,
  DesktopTaskWorkspaceAdapterError,
  taskWorkspaceAdapterKey,
  type TaskWorkspaceAdapter,
} from "../../adapters/task-workspace-adapter.js";
import type { DesktopRendererEvent } from "../../shared/foundation-api.js";
import {
  presentArtifactPreview,
  type ArtifactPreviewPresentation,
} from "../../presentation/artifact-preview-presentation.js";
import {
  buildTaskListView,
  taskStatusFilterOptions,
  type TaskListItem,
  type TaskListStatusFilter,
} from "./task-list-model.js";
import {
  buildTaskDetailView,
  type StreamingAssistantState,
  type TaskDetailArtifactItem,
  type TaskDetailConfirmationItem,
} from "./task-detail-model.js";
import {
  buildTaskWorkspaceDirectoryView,
  presentWorkspaceError,
  type TaskWorkspaceDirectoryView,
  type TaskWorkspaceEntryView,
} from "./task-workspace-model.js";

const adapter = inject<TasksAdapter>(tasksAdapterKey, desktopTasksAdapter);
const workbenchAdapter = inject<WorkbenchAdapter>(
  workbenchAdapterKey,
  desktopWorkbenchAdapter,
);
const taskPins = inject<TaskPinStore>(taskPinStoreKey, desktopTaskPinStore);
const workspaceAdapter = inject<TaskWorkspaceAdapter>(
  taskWorkspaceAdapterKey,
  desktopTaskWorkspaceAdapter,
);
const route = useRoute();
const router = useRouter();

type DialogState =
  | { type: "rename"; item: TaskListItem; title: string }
  | { type: "delete"; item: TaskListItem }
  | { type: "cancel"; item: TaskListItem | undefined }
  | { type: "provide_input"; input: string }
  | {
    type: "confirmation";
    confirmation: TaskDetailConfirmationItem;
    decision: "confirmed" | "rejected";
  };

type SidePanelTab = "overview" | "workspace";
type WorkspacePanelStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "permission_denied"
  | "unavailable"
  | "error";
type WorkspaceTrailItem = Readonly<{
  label: string;
  parentEntryId: string | undefined;
}>;
type WorkspacePanelState = {
  taskId: string;
  status: WorkspacePanelStatus;
  runtimeInstanceId: string;
  revealAvailable: boolean;
  directory: TaskWorkspaceDirectoryView | undefined;
  trail: readonly WorkspaceTrailItem[];
  parentEntryId: string | undefined;
  nextCursor: string | undefined;
  messageTitle: string;
  messageDescription: string;
  retryable: boolean;
  loadingMore: boolean;
  revealBusy: boolean;
  staleRefreshUsed: boolean;
};
type ArtifactPreviewState =
  | {
    kind: "text";
    artifactId: string;
    mode: ArtifactPreviewMode;
    status: "loading";
  }
  | {
    kind: "text";
    artifactId: string;
    mode: ArtifactPreviewMode;
    status: "ready";
    preview: ArtifactPreviewPresentation;
  }
  | {
    kind: "html";
    artifactId: string;
    status: "loading";
  }
  | {
    kind: "html";
    artifactId: string;
    status: "ready";
    preview: ArtifactHtmlPreviewProjection;
  }
  | {
    kind: "error";
    artifactId: string;
    status: "error";
    message: string;
  };

const data = reactive<TasksAdapterData>({
  sessions: [],
  tasks: [],
});
const selectedSessionId = ref("");
const selectedTaskId = ref("");
const selectedDetail = ref<TaskDetailProjection>();
const snapshot = ref<ConversationSnapshot>();
const streamingAssistant = ref<StreamingAssistantState>();
const sidePanelTab = ref<SidePanelTab>("overview");
const sidePanelCollapsed = ref(false);
const sidePanelFullscreen = ref(false);
const openArtifactTabIds = ref<readonly string[]>([]);
const activeArtifactId = ref("");
const artifactPreview = ref<ArtifactPreviewState>();
const searchQuery = ref("");
const statusFilter = ref<TaskListStatusFilter>("all");
const loading = ref(true);
const detailLoading = ref(false);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const conversationDraft = ref("");
const conversationSubmitting = ref(false);
const conversationStream = ref<HTMLElement>();
const dialog = ref<DialogState>();
const workspaceState = reactive<WorkspacePanelState>({
  taskId: "",
  status: "idle",
  runtimeInstanceId: "",
  revealAvailable: false,
  directory: undefined,
  trail: [{ label: "工作空间", parentEntryId: undefined }],
  parentEntryId: undefined,
  nextCursor: undefined,
  messageTitle: "选择一个任务",
  messageDescription: "打开任务后可查看其锁定工作空间中的文件元数据。",
  retryable: false,
  loadingMore: false,
  revealBusy: false,
  staleRefreshUsed: false,
});
let unsubscribe: (() => void) | undefined;
let workspaceRequestSequence = 0;
let detailRequestSequence = 0;
let conversationRequestSequence = 0;

const statusOptions = taskStatusFilterOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));

const taskView = computed(() => buildTaskListView({
  sessions: data.sessions,
  tasks: data.tasks,
  pinnedTaskIds: taskPins.pinnedTaskIds.value,
  searchQuery: searchQuery.value,
  statusFilter: statusFilter.value,
}));

const selectedDetailView = computed(() => selectedDetail.value === undefined
  ? undefined
  : buildTaskDetailView({
    detail: selectedDetail.value,
    snapshot: snapshot.value,
    streamingAssistant: streamingAssistant.value,
    includeSessionMessages: true,
  }));
const selectedSessionTitle = computed(() => data.sessions.find((session) =>
  session.sessionId === selectedSessionId.value)?.title ?? "任务对话");
const conversationTurnReady = computed(() =>
  selectedDetail.value?.summary.displayStatus === "completed"
  && selectedDetail.value.summary.taskId === selectedTaskId.value);
const conversationCanSubmit = computed(() =>
  conversationTurnReady.value
  && selectedSessionId.value !== ""
  && conversationDraft.value.trim() !== ""
  && !conversationSubmitting.value);
const artifactTabs = computed(() => {
  const artifacts = selectedDetailView.value?.artifacts ?? [];
  const open = new Set(openArtifactTabIds.value);
  return artifacts.filter((artifact) => open.has(artifact.id));
});

const activeArtifact = computed(() =>
  selectedDetailView.value?.artifacts.find((artifact) =>
    artifact.id === activeArtifactId.value));

const summaryMetrics = computed(() => [
  { label: "全部", value: taskView.value.summary.total },
  { label: "进行中", value: taskView.value.summary.active },
  { label: "需处理", value: taskView.value.summary.attention },
  { label: "已完成", value: taskView.value.summary.completed },
  { label: "异常", value: taskView.value.summary.failed },
]);

const workspaceCanReveal = computed(() =>
  selectedTaskId.value !== ""
  && workspaceState.revealAvailable
  && workspaceState.status !== "loading");

const workspaceMessageTone = computed(() => {
  switch (workspaceState.status) {
    case "permission_denied":
      return "warning";
    case "unavailable":
      return "warning";
    case "error":
      return "danger";
    default:
      return "info";
  }
});

const dialogTitle = computed(() => {
  switch (dialog.value?.type) {
    case "rename":
      return "重命名任务";
    case "delete":
      return "删除任务";
    case "cancel":
      return "停止任务";
    case "provide_input":
      return "补充输入";
    case "confirmation":
      return dialog.value.decision === "confirmed" ? "允许操作" : "拒绝操作";
    case undefined:
      return "";
  }
});

const dialogConfirmLabel = computed(() => {
  switch (dialog.value?.type) {
    case "rename":
      return "保存";
    case "delete":
      return "删除";
    case "cancel":
      return "停止";
    case "provide_input":
      return "提交";
    case "confirmation":
      return dialog.value.decision === "confirmed" ? "允许" : "拒绝";
    case undefined:
      return "确认";
  }
});

onMounted(() => {
  unsubscribe = adapter.subscribe(handleDesktopEvent);
  void initializePage();
});

onUnmounted(() => {
  unsubscribe?.();
  void closeCurrentHtmlPreview();
});

watch([sidePanelTab, selectedTaskId], ([tab, taskId], [previousTab, previousTaskId]) => {
  if (taskId !== previousTaskId) {
    resetWorkspacePanel(taskId);
  }
  if (tab === "workspace" && taskId !== "" && (
    previousTab !== "workspace"
    || taskId !== previousTaskId
    || workspaceState.status === "idle"
  )) {
    void loadWorkspaceRoot();
  }
});

watch(
  () => [
    singleQueryValue(route?.query.taskId),
    singleQueryValue(route?.query.sessionId),
  ] as const,
  ([taskId, sessionId]) => {
    if (
      taskId === ""
      || sessionId === ""
      || (taskId === selectedTaskId.value && sessionId === selectedSessionId.value)
    ) return;
    const item = taskView.value.items.find((candidate) =>
      candidate.task?.taskId === taskId && candidate.session.sessionId === sessionId);
    if (item !== undefined) void openTask(item);
  },
);

watch(
  () => [
    selectedDetailView.value?.messages.length ?? 0,
    streamingAssistant.value?.text.length ?? 0,
  ] as const,
  () => { void scrollConversationToBottom(); },
  { flush: "post" },
);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    Object.assign(data, await adapter.loadTasks());
    await refreshSelectedDetail();
    error.value = "";
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    loading.value = false;
  }
}

async function initializePage(): Promise<void> {
  await refresh();
  const taskId = singleQueryValue(route?.query.taskId);
  const sessionId = singleQueryValue(route?.query.sessionId);
  if (taskId === "" || sessionId === "") return;
  const item = taskView.value.items.find((candidate) =>
    candidate.task?.taskId === taskId && candidate.session.sessionId === sessionId);
  if (item !== undefined) await openTask(item);
}

async function openTask(item: TaskListItem): Promise<void> {
  if (item.task !== undefined && item.task.taskId !== selectedTaskId.value) {
    resetWorkspacePanel(item.task.taskId);
  }
  await guarded(async () => {
    await adapter.openTask(item.session.sessionId);
    if (item.task === undefined) {
      await router?.push({
        name: "workbench",
        query: { sessionId: item.session.sessionId },
      });
      return;
    }
    selectedSessionId.value = item.session.sessionId;
    const opened = await loadSelectedTask(item.task.taskId, item.session.sessionId);
    if (!opened) return;
    await router?.replace({
      name: "tasks",
      query: { sessionId: item.session.sessionId, taskId: item.task.taskId },
    });
    notice.value = "已打开任务对话。";
  });
}

async function closeTaskDetail(): Promise<void> {
  detailRequestSequence += 1;
  conversationRequestSequence += 1;
  selectedSessionId.value = "";
  selectedTaskId.value = "";
  selectedDetail.value = undefined;
  snapshot.value = undefined;
  streamingAssistant.value = undefined;
  sidePanelCollapsed.value = false;
  sidePanelFullscreen.value = false;
  resetArtifactPanel();
  resetWorkspacePanel("");
  await router.replace({ name: "tasks" });
}

function togglePin(item: TaskListItem): void {
  if (item.task === undefined) return;
  if (taskPins.toggle(item.task.taskId)) {
    notice.value = "已在本次运行置顶。";
  } else {
    notice.value = "已取消本次视图置顶。";
  }
}

function showRenameDialog(item: TaskListItem): void {
  dialog.value = { type: "rename", item, title: item.title };
}

function showDeleteDialog(item: TaskListItem): void {
  if (!item.canDelete) return;
  dialog.value = { type: "delete", item };
}

function showCancelDialog(item: TaskListItem): void {
  dialog.value = { type: "cancel", item };
}

function showDetailCancelDialog(): void {
  dialog.value = { type: "cancel", item: undefined };
}

function showProvideInputDialog(): void {
  if (selectedDetail.value === undefined) return;
  dialog.value = { type: "provide_input", input: "" };
}

function showConfirmationDialog(
  confirmation: TaskDetailConfirmationItem,
  decision: "confirmed" | "rejected",
): void {
  dialog.value = { type: "confirmation", confirmation, decision };
}

function closeDialog(): void {
  if (!busy.value) dialog.value = undefined;
}

async function confirmDialog(): Promise<void> {
  const current = dialog.value;
  if (current === undefined) return;
  if (current.type === "rename") {
    await renameTask(current.item, current.title.trim());
    return;
  }
  if (current.type === "delete") {
    await deleteTask(current.item);
    return;
  }
  if (current.type === "cancel") {
    await cancelTask(current.item);
    return;
  }
  if (current.type === "provide_input") {
    await provideSelectedTaskInput(current.input.trim());
    return;
  }
  await decideConfirmation(current.confirmation, current.decision);
}

async function renameTask(item: TaskListItem, title: string): Promise<void> {
  if (title === "" || title === item.title) {
    closeDialog();
    return;
  }
  await guarded(async () => {
    const updated = await adapter.renameTask({
      sessionId: item.session.sessionId,
      expectedRevision: item.session.revision,
      title,
    });
    data.sessions = data.sessions.map((session) =>
      session.sessionId === updated.sessionId ? updated : session);
    notice.value = "任务已重命名。";
    dialog.value = undefined;
  });
}

async function cancelTask(item: TaskListItem | undefined): Promise<void> {
  const task = item?.task ?? selectedDetail.value?.summary;
  if (task === undefined) return;
  await guarded(async () => {
    await adapter.cancelTask({
      taskId: task.taskId,
      expectedTaskRevision: task.revision,
    });
    notice.value = "停止请求已提交。";
    dialog.value = undefined;
    await refresh();
  });
}

async function deleteTask(item: TaskListItem): Promise<void> {
  if (!item.canDelete) return;
  await guarded(async () => {
    const deleted = await adapter.deleteTask({
      sessionId: item.session.sessionId,
      expectedRevision: item.session.revision,
    });
    data.sessions = data.sessions.filter((session) =>
      session.sessionId !== deleted.sessionId);
    data.tasks = data.tasks.filter((task) =>
      task.sessionId !== deleted.sessionId);
    if (item.task !== undefined) taskPins.remove(item.task.taskId);
    if (selectedSessionId.value === deleted.sessionId) {
      selectedSessionId.value = "";
      selectedTaskId.value = "";
      selectedDetail.value = undefined;
      snapshot.value = undefined;
      streamingAssistant.value = undefined;
      resetWorkspacePanel("");
    }
    notice.value = "任务已删除。";
    dialog.value = undefined;
  });
}

async function controlSelectedTask(
  type: "retry_task" | "continue_task",
): Promise<void> {
  const task = selectedDetail.value?.summary;
  if (task === undefined) return;
  await guarded(async () => {
    if (type === "retry_task") {
      await adapter.retryTask({
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
      });
    } else {
      await adapter.continueTask({
        taskId: task.taskId,
        expectedTaskRevision: task.revision,
      });
    }
    notice.value = type === "retry_task" ? "重试请求已提交。" : "继续请求已提交。";
    await refreshSelectedDetail();
  });
}

async function submitConversationTurn(): Promise<void> {
  const detail = selectedDetail.value;
  const text = conversationDraft.value.trim();
  if (
    detail?.summary.displayStatus !== "completed"
    || selectedSessionId.value === ""
    || text === ""
    || conversationSubmitting.value
  ) return;

  conversationSubmitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const catalog = await workbenchAdapter.loadWorkbenchData();
    const summary = detail.summary;
    const rememberedSelection = conversationSelection(selectedSessionId.value);
    const agentId = rememberedSelection?.agentId
      ?? (summary.resolvedAgentId === "agent.general" ? "" : summary.resolvedAgentId);
    const requestedModelId = rememberedSelection?.requestedModelId
      ?? summary.resolvedModelId;
    const modelAvailable = catalog.models.some((model) =>
      model.modelId === requestedModelId && model.available);
    const agent = agentId === ""
      ? undefined
      : catalog.agents.find((candidate) => candidate.agentId === agentId);
    const selectedSkillIds = rememberedSelection?.selectedSkillIds ?? [];
    const selectedKnowledgeIds = rememberedSelection?.selectedKnowledgeIds ?? [];
    const availableSkillIds = new Set(agent?.skills
      .filter((skill) => skill.available)
      .map((skill) => skill.id) ?? []);
    const availableKnowledgeIds = new Set(agent?.knowledge
      .filter((knowledge) => knowledge.available)
      .map((knowledge) => knowledge.id) ?? []);
    if (
      (rememberedSelection === undefined && agentId !== "")
      || !modelAvailable
      || (agentId !== "" && agent === undefined)
      || (agent !== undefined && (
      !agent.runnable
      || !agent.eligibleModels.some((model) => model.modelId === requestedModelId)
      || selectedSkillIds.some((skillId) => !availableSkillIds.has(skillId))
      || selectedKnowledgeIds.some((knowledgeId) => !availableKnowledgeIds.has(knowledgeId))
      ))
    ) {
      throw new DesktopWorkbenchAdapterError(
        rememberedSelection === undefined && agentId !== ""
          ? "该历史对话缺少可安全复用的机器人资源，请新建任务并重新选择。"
          : "当前机器人或模型已不可用，请新建任务并重新选择。",
      );
    }

    const session = data.sessions.find((candidate) =>
      candidate.sessionId === selectedSessionId.value);
    const result = await workbenchAdapter.submitTask({
      sessionId: selectedSessionId.value,
      sessionTitle: session?.title ?? "持续对话",
      userInput: text,
      agentId,
      requestedModelId,
      selectedSkillIds,
      selectedKnowledgeIds,
      ...(rememberedSelection?.workspaceGrantId === undefined
        ? {}
        : { workspaceGrantId: rememberedSelection.workspaceGrantId }),
      attachments: [],
    });
    conversationDraft.value = "";
    selectedSessionId.value = result.session.sessionId;
    selectedTaskId.value = result.receipt.taskId;
    rememberConversationSelection(result.session.sessionId, {
      agentId,
      requestedModelId,
      selectedSkillIds,
      selectedKnowledgeIds,
      ...(rememberedSelection?.workspaceGrantId === undefined
        ? {}
        : { workspaceGrantId: rememberedSelection.workspaceGrantId }),
    });
    await router.replace({
      name: "tasks",
      query: {
        sessionId: result.session.sessionId,
        taskId: result.receipt.taskId,
      },
    });
    await refresh();
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    conversationSubmitting.value = false;
  }
}

function handleConversationKeydown(event: KeyboardEvent): void {
  if (
    event.key !== "Enter"
    || event.shiftKey
    || event.isComposing
  ) return;
  event.preventDefault();
  if (conversationCanSubmit.value) void submitConversationTurn();
}

async function scrollConversationToBottom(): Promise<void> {
  await nextTick();
  const element = conversationStream.value;
  if (element !== undefined) element.scrollTop = element.scrollHeight;
}

async function provideSelectedTaskInput(input: string): Promise<void> {
  const task = selectedDetail.value?.summary;
  if (task === undefined || input === "") return;
  await guarded(async () => {
    await adapter.provideTaskInput({
      taskId: task.taskId,
      expectedTaskRevision: task.revision,
      input,
    });
    notice.value = "补充输入已提交。";
    dialog.value = undefined;
    await refreshSelectedDetail();
  });
}

async function decideConfirmation(
  confirmation: TaskDetailConfirmationItem,
  decision: "confirmed" | "rejected",
): Promise<void> {
  const task = selectedDetail.value?.summary;
  if (task === undefined || !confirmation.canDecide) return;
  await guarded(async () => {
    await adapter.decideUserConfirmation({
      taskId: task.taskId,
      expectedTaskRevision: task.revision,
      confirmation: confirmation.source,
      decision,
    });
    notice.value = decision === "confirmed" ? "操作已允许。" : "操作已拒绝。";
    dialog.value = undefined;
    await refreshSelectedDetail();
  });
}

async function loadSelectedTask(
  taskId: string,
  sessionId: string,
): Promise<boolean> {
  const sequence = ++detailRequestSequence;
  detailLoading.value = true;
  const taskChanged = selectedTaskId.value !== "" && selectedTaskId.value !== taskId;
  const conversationRefresh = refreshConversation(sessionId).catch((caught: unknown) => {
    if (sequence === detailRequestSequence && sessionId === selectedSessionId.value) {
      error.value = explainError(caught);
    }
  });
  try {
    const detail = await adapter.loadTaskDetail(taskId);
    await conversationRefresh;
    if (sequence !== detailRequestSequence || sessionId !== selectedSessionId.value) return false;
    if (taskChanged) {
      resetArtifactPanel();
      void closeCurrentHtmlPreview();
    }
    selectedTaskId.value = taskId;
    selectedDetail.value = detail;
    syncArtifactTabs(detail);
    error.value = "";
    return true;
  } catch (caught) {
    await conversationRefresh;
    if (sequence === detailRequestSequence && sessionId === selectedSessionId.value) {
      error.value = explainError(caught);
    }
    return false;
  } finally {
    if (sequence === detailRequestSequence) detailLoading.value = false;
  }
}

async function refreshConversation(sessionId = selectedSessionId.value): Promise<void> {
  if (sessionId === "") return;
  const sequence = ++conversationRequestSequence;
  const conversation = await adapter.loadConversation(sessionId);
  if (sequence !== conversationRequestSequence || sessionId !== selectedSessionId.value) return;
  snapshot.value = conversation;
}

function singleQueryValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function openArtifactTab(artifact: TaskDetailArtifactItem): void {
  const open = new Set(openArtifactTabIds.value);
  open.add(artifact.id);
  openArtifactTabIds.value = Array.from(open);
  activeArtifactId.value = artifact.id;
}

function closeArtifactTab(artifactId: string): void {
  const next = openArtifactTabIds.value.filter((id) => id !== artifactId);
  openArtifactTabIds.value = next;
  if (activeArtifactId.value === artifactId) {
    activeArtifactId.value = next.at(0) ?? "";
  }
  if (artifactPreview.value?.artifactId === artifactId) {
    void closeCurrentHtmlPreview();
    artifactPreview.value = undefined;
  }
}

async function loadArtifactPreview(
  artifact: TaskDetailArtifactItem,
  mode: ArtifactPreviewMode,
): Promise<void> {
  if (!artifact.canPreviewText) return;
  await guarded(async () => {
    await closeCurrentHtmlPreview();
    artifactPreview.value = {
      kind: "text",
      artifactId: artifact.id,
      mode,
      status: "loading",
    };
    const preview = await adapter.previewArtifact({
      artifactId: artifact.id,
      mode,
    });
    artifactPreview.value = {
      kind: "text",
      artifactId: artifact.id,
      mode,
      status: "ready",
      preview: presentArtifactPreview(preview),
    };
    openArtifactTab(artifact);
  });
}

async function startHtmlPreview(artifact: TaskDetailArtifactItem): Promise<void> {
  if (!artifact.canPreviewHtml) return;
  await guarded(async () => {
    await closeCurrentHtmlPreview();
    artifactPreview.value = {
      kind: "html",
      artifactId: artifact.id,
      status: "loading",
    };
    const preview = await adapter.startArtifactHtmlPreview({
      artifactId: artifact.id,
    });
    artifactPreview.value = {
      kind: "html",
      artifactId: artifact.id,
      status: "ready",
      preview,
    };
    openArtifactTab(artifact);
  });
}

async function closeCurrentHtmlPreview(): Promise<void> {
  const current = artifactPreview.value;
  if (current?.kind !== "html" || current.status !== "ready") return;
  try {
    await adapter.closeArtifactPreview({
      previewSessionId: current.preview.previewSessionId,
    });
  } catch {
    // Closing a best-effort local preview session must not block page teardown.
  }
}

async function setArtifactLifecycle(
  artifact: TaskDetailArtifactItem,
  change: { pinned?: boolean; dismissed?: boolean },
): Promise<void> {
  await guarded(async () => {
    await adapter.setArtifactLifecycle({
      artifactId: artifact.id,
      ...change,
    });
    notice.value = "成果状态已更新。";
    await refreshSelectedDetail();
  });
}

async function openArtifactLocation(artifact: TaskDetailArtifactItem): Promise<void> {
  if (!artifact.canOpenLocation) return;
  await guarded(async () => {
    const receipt = await adapter.openArtifactLocation({ artifactId: artifact.id });
    notice.value = receipt.opened ? "已在文件夹中定位成果。" : "未打开文件夹。";
  });
}

async function exportArtifact(artifact: TaskDetailArtifactItem): Promise<void> {
  if (!artifact.canExport) return;
  await guarded(async () => {
    const receipt = await adapter.exportArtifact({ artifactId: artifact.id });
    notice.value = receipt.exported
      ? `成果已导出：${receipt.fileName ?? "文件"}`
      : "已取消导出。";
  });
}

function syncArtifactTabs(detail: TaskDetailProjection): void {
  const ids = new Set(detail.artifacts.map((artifact) => artifact.artifactId));
  const next = openArtifactTabIds.value.filter((id) => ids.has(id));
  const first = detail.artifacts.at(0)?.artifactId ?? "";
  openArtifactTabIds.value = next.length > 0
    ? next
    : first === "" ? [] : [first];
  if (!ids.has(activeArtifactId.value)) {
    activeArtifactId.value = openArtifactTabIds.value.at(0) ?? "";
  }
  if (
    artifactPreview.value !== undefined
    && !ids.has(artifactPreview.value.artifactId)
  ) {
    void closeCurrentHtmlPreview();
    artifactPreview.value = undefined;
  }
}

function resetArtifactPanel(): void {
  openArtifactTabIds.value = [];
  activeArtifactId.value = "";
  artifactPreview.value = undefined;
  sidePanelTab.value = "overview";
}

function resetWorkspacePanel(taskId = selectedTaskId.value): void {
  workspaceRequestSequence += 1;
  workspaceState.taskId = taskId;
  workspaceState.status = taskId === "" ? "idle" : "idle";
  workspaceState.runtimeInstanceId = "";
  workspaceState.revealAvailable = false;
  workspaceState.directory = undefined;
  workspaceState.trail = [{ label: "工作空间", parentEntryId: undefined }];
  workspaceState.parentEntryId = undefined;
  workspaceState.nextCursor = undefined;
  workspaceState.messageTitle = taskId === "" ? "选择一个任务" : "工作空间文件未加载";
  workspaceState.messageDescription = taskId === ""
    ? "打开任务后可查看其锁定工作空间中的文件元数据。"
    : "切换到工作空间文件后会加载真实的安全文件元数据。";
  workspaceState.retryable = false;
  workspaceState.loadingMore = false;
  workspaceState.revealBusy = false;
  workspaceState.staleRefreshUsed = false;
}

async function loadWorkspaceRoot(): Promise<void> {
  const taskId = selectedTaskId.value;
  if (taskId === "") return;
  await loadWorkspaceDirectory({
    taskId,
    parentEntryId: undefined,
    trail: [{ label: "工作空间", parentEntryId: undefined }],
  });
}

async function openWorkspaceDirectory(entry: TaskWorkspaceEntryView): Promise<void> {
  if (!entry.navigable) return;
  const taskId = selectedTaskId.value;
  if (taskId === "") return;
  await loadWorkspaceDirectory({
    taskId,
    parentEntryId: entry.id,
    trail: [
      ...workspaceState.trail,
      { label: entry.displayName, parentEntryId: entry.id },
    ],
  });
}

async function openWorkspaceTrail(item: WorkspaceTrailItem, index: number): Promise<void> {
  const taskId = selectedTaskId.value;
  if (taskId === "") return;
  await loadWorkspaceDirectory({
    taskId,
    parentEntryId: item.parentEntryId,
    trail: workspaceState.trail.slice(0, index + 1),
  });
}

async function loadMoreWorkspaceEntries(): Promise<void> {
  const taskId = selectedTaskId.value;
  const cursor = workspaceState.nextCursor;
  if (taskId === "" || cursor === undefined || workspaceState.loadingMore) return;
  workspaceState.loadingMore = true;
  const sequence = ++workspaceRequestSequence;
  try {
    const projection = await workspaceAdapter.listEntries({
      taskId,
      parentEntryId: workspaceState.parentEntryId,
      cursor,
      limit: 50,
    });
    if (!isCurrentWorkspaceResponse(sequence, taskId)) return;
    const next = buildTaskWorkspaceDirectoryView(projection);
    const existing = workspaceState.directory?.entries ?? [];
    workspaceState.directory = {
      ...next,
      entries: [...existing, ...next.entries],
      empty: existing.length + next.entries.length === 0,
    };
    workspaceState.status = workspaceState.directory.empty ? "empty" : "ready";
    workspaceState.nextCursor = next.nextCursor;
    workspaceState.staleRefreshUsed = false;
  } catch (caught) {
    if (
      caught instanceof DesktopTaskWorkspaceAdapterError
      && caught.code === "workspace.browser_cursor_stale"
      && !workspaceState.staleRefreshUsed
    ) {
      workspaceState.staleRefreshUsed = true;
      workspaceState.loadingMore = false;
      await loadWorkspaceDirectory({
        taskId,
        parentEntryId: workspaceState.parentEntryId,
        trail: workspaceState.trail,
        preserveStaleNotice: true,
      });
      return;
    }
    if (!isCurrentWorkspaceResponse(sequence, taskId)) return;
    applyWorkspaceError(caught);
  } finally {
    if (isCurrentWorkspaceResponse(sequence, taskId)) {
      workspaceState.loadingMore = false;
    }
  }
}

async function revealTaskWorkspaceLocation(): Promise<void> {
  const taskId = selectedTaskId.value;
  if (taskId === "" || !workspaceCanReveal.value) return;
  workspaceState.revealBusy = true;
  try {
    await workspaceAdapter.openTaskWorkspaceLocation({ taskId });
    notice.value = "已请求打开任务工作空间位置。";
  } catch (caught) {
    const view = presentWorkspaceError(caught);
    error.value = view.description;
  } finally {
    workspaceState.revealBusy = false;
  }
}

async function loadWorkspaceDirectory(input: {
  taskId: string;
  parentEntryId: string | undefined;
  trail: readonly WorkspaceTrailItem[];
  preserveStaleNotice?: boolean;
}): Promise<void> {
  const sequence = ++workspaceRequestSequence;
  workspaceState.taskId = input.taskId;
  workspaceState.status = "loading";
  workspaceState.messageTitle = "正在加载工作空间文件";
  workspaceState.messageDescription = "只加载 Renderer-safe 文件元数据。";
  workspaceState.retryable = false;
  try {
    const compatibility = await workspaceAdapter.negotiate();
    if (!isCurrentWorkspaceResponse(sequence, input.taskId)) return;
    if (workspaceState.runtimeInstanceId !== ""
      && compatibility.runtimeInstanceId !== workspaceState.runtimeInstanceId) {
      workspaceState.directory = undefined;
      workspaceState.trail = [{ label: "工作空间", parentEntryId: undefined }];
      workspaceState.parentEntryId = undefined;
      workspaceState.nextCursor = undefined;
    }
    workspaceState.runtimeInstanceId = compatibility.runtimeInstanceId;
    workspaceState.revealAvailable = compatibility.revealAvailable;
    if (!compatibility.browserAvailable) {
      workspaceState.status = "unavailable";
      workspaceState.messageTitle = "工作空间文件不可用";
      workspaceState.messageDescription = compatibility.safeSummary
        ?? "当前运行时尚未提供工作空间文件浏览能力。";
      workspaceState.retryable = false;
      return;
    }
    const projection = await workspaceAdapter.listEntries({
      taskId: input.taskId,
      parentEntryId: input.parentEntryId,
      limit: 50,
    });
    if (!isCurrentWorkspaceResponse(sequence, input.taskId)) return;
    const view = buildTaskWorkspaceDirectoryView(projection);
    workspaceState.directory = view;
    workspaceState.trail = input.trail;
    workspaceState.parentEntryId = input.parentEntryId;
    workspaceState.nextCursor = view.nextCursor;
    workspaceState.status = view.empty ? "empty" : "ready";
    workspaceState.messageTitle = input.preserveStaleNotice ? "目录已刷新" : "";
    workspaceState.messageDescription = input.preserveStaleNotice
      ? "目录快照已变化，已从当前目录第一页重新加载。"
      : "";
  } catch (caught) {
    if (!isCurrentWorkspaceResponse(sequence, input.taskId)) return;
    applyWorkspaceError(caught);
  }
}

function applyWorkspaceError(caught: unknown): void {
  const view = presentWorkspaceError(caught);
  workspaceState.status = view.state;
  workspaceState.messageTitle = view.title;
  workspaceState.messageDescription = view.description;
  workspaceState.retryable = view.retryable;
  workspaceState.directory = undefined;
  workspaceState.nextCursor = undefined;
}

function isCurrentWorkspaceResponse(sequence: number, taskId: string): boolean {
  return sequence === workspaceRequestSequence && taskId === selectedTaskId.value;
}

async function refreshSelectedDetail(): Promise<void> {
  const taskId = selectedTaskId.value;
  const sessionId = selectedSessionId.value;
  if (taskId === "" || sessionId === "") return;
  await loadSelectedTask(taskId, sessionId);
}

function handleDesktopEvent(event: DesktopRendererEvent): void {
  if (!("deliveryKind" in event)) {
    streamingAssistant.value = undefined;
    void refreshConversation().catch((caught: unknown) => {
      error.value = explainError(caught);
    });
    void refreshSelectedDetail();
    return;
  }
  if (
    event.deliveryKind === "ephemeral"
    && event.payload.type === "assistant_token_delta"
    && event.payload.sessionId === selectedSessionId.value
  ) {
    const current = streamingAssistant.value;
    if (
      current === undefined
      || current.messageId !== event.payload.messageId
      || current.runtimeInstanceId !== event.runtimeInstanceId
    ) {
      if (event.payload.deltaSequence !== 0) return;
      streamingAssistant.value = {
        sessionId: event.payload.sessionId,
        messageId: event.payload.messageId,
        runtimeInstanceId: event.runtimeInstanceId,
        lastDeltaSequence: 0,
        text: event.payload.delta,
      };
      return;
    }
    if (event.payload.deltaSequence !== current.lastDeltaSequence + 1) return;
    streamingAssistant.value = {
      ...current,
      lastDeltaSequence: event.payload.deltaSequence,
      text: current.text + event.payload.delta,
    };
    return;
  }
  if (
    event.deliveryKind === "durable"
    && event.payload.type === "message_committed"
    && event.payload.sessionId === selectedSessionId.value
  ) {
    if (streamingAssistant.value?.messageId === event.payload.messageId) {
      streamingAssistant.value = undefined;
    }
    void refreshConversation().catch((caught: unknown) => {
      error.value = explainError(caught);
    });
    return;
  }
  if (
    event.deliveryKind === "durable"
    && event.payload.type === "task_status_changed"
    && event.payload.taskId === selectedTaskId.value
  ) {
    void refreshSelectedDetail();
    return;
  }
  if (
    event.deliveryKind === "durable"
    && (
      event.payload.type === "tool_activity_changed"
      || event.payload.type === "user_confirmation_changed"
    )
    && event.payload.taskId === selectedTaskId.value
  ) {
    void refreshSelectedDetail();
  }
}

async function guarded(operation: () => Promise<void>): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await operation();
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

function explainError(caught: unknown): string {
  if (caught instanceof DesktopTasksAdapterError
    || caught instanceof DesktopTaskWorkspaceAdapterError
    || caught instanceof DesktopWorkbenchAdapterError) return caught.message;
  return "任务暂时不可用，请稍后重试。";
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
</script>

<style scoped>
.tasks-page {
  display: grid;
  align-content: start;
  gap: 14px;
  min-height: 100%;
  padding: 18px;
}

.tasks-page--conversation {
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: var(--r3-color-surface);
}

.tasks-page--conversation > :deep(.r3-inline-notice) {
  margin: 10px 14px 0;
}

.tasks-page__header,
.tasks-page__toolbar,
.tasks-page__item,
.tasks-page__item-title,
.tasks-page__item-meta,
.tasks-page__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tasks-page__header {
  justify-content: space-between;
}

.tasks-page__header h2 {
  margin: 0;
  font-size: 21px;
}

.tasks-page__eyebrow,
.tasks-page__item-meta,
.tasks-page__delete-note {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.tasks-page__summary :deep(.r3-card__body) {
  padding: 9px 11px;
}

.tasks-page__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.tasks-page__workspace--detail {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.tasks-page__conversation-shell {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--r3-color-surface);
}

.tasks-page__conversation-header {
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--r3-color-border);
  padding: 10px 16px;
  background: var(--r3-color-surface);
}

.tasks-page__conversation-heading,
.tasks-page__conversation-header-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.tasks-page__conversation-heading > div {
  min-width: 0;
}

.tasks-page__conversation-heading h2,
.tasks-page__conversation-heading p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tasks-page__conversation-heading h2 {
  font-size: 16px;
  font-weight: 680;
}

.tasks-page__conversation-heading p {
  max-width: min(48vw, 680px);
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-xs);
}

.tasks-page__conversation-loading {
  align-content: center;
  width: min(720px, calc(100% - 48px));
  margin: 0 auto;
}

.tasks-page__metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.tasks-page__metric strong {
  font-size: 18px;
}

.tasks-page__metric span {
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
}

.tasks-page__toolbar {
  flex-wrap: wrap;
}

.tasks-page__toolbar :deep(.r3-search-field) {
  min-width: min(320px, 100%);
  flex: 1;
}

.tasks-page__toolbar :deep(.r3-field) {
  min-width: 160px;
}

.tasks-page__loading,
.tasks-page__list {
  display: grid;
  gap: 10px;
}

.tasks-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tasks-page__item {
  justify-content: space-between;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  background: var(--r3-color-surface);
}

.tasks-page__item--pinned {
  border-color: var(--r3-color-primary);
  background: var(--r3-color-primary-subtle);
}

.tasks-page__item--selected {
  box-shadow: inset 3px 0 0 var(--r3-color-primary);
}

.tasks-page__item-main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.tasks-page__item-title {
  min-width: 0;
  flex-wrap: wrap;
}

.tasks-page__item-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tasks-page__item-meta,
.tasks-page__actions {
  flex-wrap: wrap;
}

.tasks-page__delete-note {
  margin: 0;
}

.tasks-page__detail,
.tasks-page__detail-section,
.tasks-page__cards,
.tasks-page__messages,
.tasks-page__side-panel,
.tasks-page__side-section,
.tasks-page__artifact-detail,
.tasks-page__preview,
.tasks-page__preview-blocks {
  display: grid;
  gap: 12px;
}

.tasks-page__conversation-shell > .tasks-page__detail {
  min-height: 0;
  height: 100%;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 8px;
  overflow: hidden;
  padding: 10px 0 0 14px;
}

.tasks-page__conversation-shell > .tasks-page__detail > :deep(.r3-inline-notice),
.tasks-page__conversation-shell > .tasks-page__detail > .tasks-page__detail-status,
.tasks-page__conversation-shell > .tasks-page__detail > .tasks-page__detail-actions {
  margin-right: 14px;
}

.tasks-page__detail-body {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
  gap: 12px;
  align-items: stretch;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.tasks-page__detail-body--collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.tasks-page__conversation-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tasks-page__view-select select {
  min-height: 34px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 30px 0 10px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  font-weight: 700;
}

.tasks-page__detail-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  background: var(--r3-color-surface);
}

.tasks-page__detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.tasks-page__detail-header h3,
.tasks-page__detail-header p,
.tasks-page__detail-section h4,
.tasks-page__side-header h4,
.tasks-page__side-header p,
.tasks-page__message p,
.tasks-page__subcard p,
.tasks-page__artifact-detail p,
.tasks-page__preview p {
  margin: 0;
}

.tasks-page__detail-header p,
.tasks-page__side-header p {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__detail-status,
.tasks-page__detail-actions,
.tasks-page__subcard-header,
.tasks-page__message header,
.tasks-page__side-header,
.tasks-page__side-actions,
.tasks-page__artifact-actions,
.tasks-page__preview-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tasks-page__side-header {
  justify-content: space-between;
}

.tasks-page__side-panel {
  min-width: 0;
  height: 100%;
  overflow: auto;
  border: 0;
  border-left: 1px solid var(--r3-color-border);
  border-radius: 0;
  padding: 14px;
  background: var(--r3-color-surface-muted);
}

.tasks-page__side-panel--collapsed {
  align-self: start;
}

.tasks-page__side-panel--fullscreen {
  position: fixed;
  inset: 24px;
  z-index: 30;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(26, 29, 46, 0.18);
}

.tasks-page__artifact-tabs,
.tasks-page__artifact-list,
.tasks-page__workspace-entries {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tasks-page__artifact-tabs {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.tasks-page__artifact-tab {
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 8px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  cursor: pointer;
}

.tasks-page__artifact-tab span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tasks-page__artifact-tab--active {
  border-color: var(--r3-color-primary);
  background: var(--r3-color-primary-subtle);
}

.tasks-page__artifact-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 10px;
  background: var(--r3-color-surface);
}

.tasks-page__artifact-card--blocked {
  border-color: var(--r3-color-danger);
}

.tasks-page__artifact-card--attention {
  border-color: var(--r3-color-warning);
}

.tasks-page__artifact-card--deleted {
  opacity: 0.72;
}

.tasks-page__artifact-open {
  min-width: 0;
  display: grid;
  gap: 3px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--r3-color-text);
  text-align: left;
  cursor: pointer;
}

.tasks-page__artifact-open span,
.tasks-page__artifact-detail p {
  overflow-wrap: anywhere;
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__artifact-detail,
.tasks-page__preview {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  background: var(--r3-color-surface-hover);
}

.tasks-page__artifact-detail dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
  font-size: var(--r3-font-size-sm);
}

.tasks-page__artifact-detail dt {
  color: var(--r3-color-text-secondary);
}

.tasks-page__artifact-detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.tasks-page__preview iframe {
  width: 100%;
  min-height: 360px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  background: var(--r3-color-surface);
}

.tasks-page__preview-blocks {
  max-height: 460px;
  overflow: auto;
}

.tasks-page__preview-blocks h5 {
  margin: 4px 0 0;
}

.tasks-page__preview-blocks pre {
  overflow: auto;
  white-space: pre-wrap;
  border-radius: var(--r3-radius-sm);
  padding: 10px;
  background: var(--r3-color-surface);
}

.tasks-page__preview-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 4px;
}

.tasks-page__preview-row span {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 4px 6px;
  background: var(--r3-color-surface);
}

.tasks-page__workspace-browser-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tasks-page__workspace-browser-header p {
  margin: 4px 0 0;
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__workspace-browser-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tasks-page__workspace-breadcrumb {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tasks-page__workspace-breadcrumb button {
  min-height: 30px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 8px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  cursor: pointer;
}

.tasks-page__workspace-breadcrumb button[aria-current="page"] {
  border-color: var(--r3-color-primary);
  background: var(--r3-color-primary-subtle);
  font-weight: 600;
}

.tasks-page__workspace-entry {
  min-width: 0;
}

.tasks-page__workspace-entry-button,
.tasks-page__workspace-entry-static {
  width: 100%;
  min-height: 52px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 10px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  text-align: left;
}

.tasks-page__workspace-entry-button {
  cursor: pointer;
}

.tasks-page__workspace-entry-button:hover {
  background: var(--r3-color-surface-hover);
}

.tasks-page__workspace-entry span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tasks-page__workspace-entry small {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__detail-status {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.tasks-page__cards,
.tasks-page__messages {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tasks-page__conversation-stream {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px clamp(18px, 5vw, 64px) 32px;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

.tasks-page__messages {
  width: min(820px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.tasks-page__confirmation-section {
  flex: 0 0 auto;
  max-height: 220px;
  overflow: auto;
  margin: 0 clamp(18px, 5vw, 64px) 10px;
  border: 1px solid var(--r3-color-warning);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  background: var(--r3-color-warning-subtle);
}

.tasks-page__conversation-composer {
  flex: 0 0 auto;
  display: grid;
  gap: 0;
  overflow: hidden;
  width: min(820px, calc(100% - 36px));
  margin: 0 auto 16px;
  border: 1px solid var(--r3-color-border-strong, var(--r3-color-border));
  border-radius: 14px;
  background: var(--r3-color-surface);
  box-shadow: 0 8px 24px rgba(26, 29, 46, 0.08);
}

.tasks-page__conversation-composer :deep(.r3-field) {
  gap: 0;
}

.tasks-page__conversation-composer :deep(.r3-field > label) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tasks-page__conversation-composer :deep(.r3-textarea) {
  min-height: 82px;
  resize: none;
  border: 0;
  border-radius: 0;
  padding: 14px 16px 8px;
  background: transparent;
  box-shadow: none;
}

.tasks-page__conversation-composer :deep(.r3-textarea:focus) {
  border: 0;
  box-shadow: none;
}

.tasks-page__conversation-composer-footer {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px 7px 14px;
  border-top: 1px solid var(--r3-color-border);
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-xs);
}

.tasks-page__conversation-composer-footer :deep(.r3-button) {
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  border-radius: 50%;
  padding: 0;
  font-size: 18px;
}

.tasks-page__subcard,
.tasks-page__message {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 11px;
  background: var(--r3-color-surface-muted);
}

.tasks-page__subcard {
  display: grid;
  gap: 8px;
}

.tasks-page__subcard dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
  font-size: var(--r3-font-size-sm);
}

.tasks-page__subcard dt,
.tasks-page__message small {
  color: var(--r3-color-text-secondary);
}

.tasks-page__subcard dd {
  margin: 0;
}

.tasks-page__message {
  grid-template-areas: "avatar body";
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  border: 0;
  padding: 0;
  background: transparent;
}

.tasks-page__message-avatar {
  grid-area: avatar;
}

.tasks-page__message-body {
  grid-area: body;
  min-width: 0;
}

.tasks-page__message-body p {
  margin-top: 7px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--r3-color-text);
  font-size: 14px;
  line-height: 1.75;
}

.message-user {
  width: min(72%, 640px);
  grid-template-areas: "body avatar";
  grid-template-columns: minmax(0, 1fr) 32px;
  justify-self: end;
}

.message-user .tasks-page__message-body {
  border-radius: 14px 4px 14px 14px;
  padding: 10px 13px;
  background: var(--r3-color-primary-subtle);
}

.message-user .tasks-page__message-body header {
  justify-content: flex-end;
}

.message-user .tasks-page__message-body p {
  margin-top: 4px;
}

.message-assistant .tasks-page__message-body,
.message-tool .tasks-page__message-body {
  padding: 2px 0 10px;
}

.tasks-page__message-avatar {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.message-assistant .tasks-page__message-avatar {
  background: var(--r3-color-primary-subtle);
  color: var(--r3-color-primary);
}

.message-tool .tasks-page__message-avatar {
  background: var(--r3-color-warning-subtle);
  color: var(--r3-color-warning);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .tasks-page__summary {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .tasks-page__detail-body {
    grid-template-columns: 1fr;
    height: 100%;
  }

  .tasks-page__detail-main {
    min-height: 0;
  }

  .tasks-page__side-panel {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 12;
    width: min(360px, calc(100% - 44px));
    height: 100%;
    max-height: none;
    border: 1px solid var(--r3-color-border);
    border-radius: var(--r3-radius-md) 0 0 var(--r3-radius-md);
    box-shadow: -16px 0 36px rgba(26, 29, 46, 0.12);
  }

  .tasks-page__item {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 720px) {
  .tasks-page {
    padding: 14px;
  }

  .tasks-page--conversation {
    padding: 0;
  }

  .tasks-page__conversation-header {
    min-height: 58px;
    padding: 8px 10px;
  }

  .tasks-page__conversation-heading p,
  .tasks-page__conversation-header-actions :deep(.r3-status-badge) {
    display: none;
  }

  .tasks-page__conversation-shell > .tasks-page__detail {
    padding-left: 8px;
  }

  .tasks-page__conversation-stream {
    padding: 18px 12px 24px 4px;
  }

  .tasks-page__conversation-composer {
    width: calc(100% - 16px);
    margin-bottom: 8px;
  }

  .message-user {
    width: min(88%, 640px);
  }

  .tasks-page__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tasks-page__toolbar,
  .tasks-page__actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
