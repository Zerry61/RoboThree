<template>
  <main class="demo-login" aria-labelledby="demo-login-title">
    <section class="demo-login__panel">
      <div class="demo-login__brand" aria-hidden="true">R</div>
      <header class="demo-login__header">
        <p>RoboThree Desktop</p>
        <h1 id="demo-login-title">进入本地演示</h1>
        <span>本地演示登录，不代表企业身份认证。</span>
      </header>

      <form class="demo-login__form" @submit.prevent="submit">
        <label>
          <span>账号</span>
          <input
            ref="usernameInput"
            v-model="username"
            name="username"
            autocomplete="username"
            spellcheck="false"
          >
        </label>
        <label>
          <span>密码</span>
          <span class="demo-login__password-field">
            <input
              ref="passwordInput"
              v-model="password"
              name="password"
              :type="passwordVisible ? 'text' : 'password'"
              autocomplete="current-password"
              aria-describedby="demo-login-error"
            >
            <button
              type="button"
              :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
              :aria-pressed="passwordVisible"
              @click="passwordVisible = !passwordVisible"
            >
              {{ passwordVisible ? "隐藏" : "显示" }}
            </button>
          </span>
        </label>

        <p id="demo-login-error" class="demo-login__error" aria-live="polite">
          {{ error }}
        </p>

        <button type="submit" class="demo-login__submit">进入演示环境</button>
      </form>

      <aside class="demo-login__help">
        <strong>演示账号</strong>
        <span>账号 admin，密码 123456</span>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { inject, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import {
  createDemoAuthSessionStore,
  demoAuthSessionKey,
} from "../../app/demo-auth-session.js";

defineOptions({ name: "RoboThreeDemoLoginPage" });

const router = useRouter();
const sessionStore = inject(demoAuthSessionKey, createDemoAuthSessionStore());
const username = ref("admin");
const password = ref("");
const passwordVisible = ref(false);
const error = ref("");
const usernameInput = ref<HTMLInputElement>();
const passwordInput = ref<HTMLInputElement>();

onMounted(() => usernameInput.value?.focus());

async function submit(): Promise<void> {
  const result = sessionStore.signIn(username.value.trim(), password.value);
  password.value = "";
  passwordVisible.value = false;
  if (!result.ok) {
    error.value = result.message;
    await nextTick();
    passwordInput.value?.focus();
    return;
  }
  error.value = "";
  await router.replace(sessionStore.consumeTarget() ?? { name: "workbench" });
}
</script>

<style scoped>
.demo-login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--r3-color-background);
  color: var(--r3-color-text);
}

.demo-login__panel {
  width: min(100%, 420px);
  display: grid;
  gap: 24px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-lg);
  padding: 32px;
  background: var(--r3-color-surface);
  box-shadow: var(--r3-shadow-md);
}

.demo-login__brand {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-primary);
  color: #fff;
  font-size: 18px;
  font-weight: 750;
}

.demo-login__header,
.demo-login__form,
.demo-login__form label {
  display: grid;
}

.demo-login__header { gap: 5px; }
.demo-login__header p { margin: 0; color: var(--r3-color-primary); font-size: var(--r3-font-size-sm); font-weight: 700; }
.demo-login__header h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
.demo-login__header span, .demo-login__help { color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }
.demo-login__form { gap: 15px; }
.demo-login__form label { gap: 6px; color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }
.demo-login__form input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--r3-color-border-strong);
  border-radius: var(--r3-radius-md);
  padding: 0 11px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
}
.demo-login__form input:focus-visible,
.demo-login__form button:focus-visible { outline: none; box-shadow: var(--r3-focus-ring); }
.demo-login__password-field { position: relative; display: grid; }
.demo-login__password-field input { padding-right: 62px; }
.demo-login__password-field button {
  position: absolute;
  right: 5px;
  top: 5px;
  min-height: 32px;
  border: 0;
  border-radius: var(--r3-radius-sm);
  padding: 0 8px;
  background: transparent;
  color: var(--r3-color-text-secondary);
}
.demo-login__password-field button:hover { background: var(--r3-color-surface-hover); }
.demo-login__error { min-height: 20px; margin: -4px 0 0; color: var(--r3-color-danger); font-size: var(--r3-font-size-sm); }
.demo-login__submit {
  min-height: 42px;
  border: 1px solid var(--r3-color-primary);
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-primary);
  color: #fff;
  font-weight: 700;
}
.demo-login__submit:hover { background: var(--r3-color-primary-hover); }
.demo-login__help { display: grid; gap: 3px; border-top: 1px solid var(--r3-color-border); padding-top: 16px; }
.demo-login__help strong { color: var(--r3-color-text); }

@media (max-width: 680px) {
  .demo-login { padding: 20px; }
  .demo-login__panel { padding: 24px; }
}

@media (max-height: 620px) {
  .demo-login { padding: 16px; }
  .demo-login__panel { gap: 14px; padding: 20px; }
  .demo-login__form { gap: 10px; }
  .demo-login__help { padding-top: 10px; }
}
</style>
