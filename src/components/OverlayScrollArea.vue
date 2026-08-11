<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const viewport = ref<HTMLElement>();
const content = ref<HTMLElement>();
const thumbHeight = ref(0);
const thumbTop = ref(0);
const hasOverflow = ref(false);
const isScrollbarVisible = ref(false);

const scrollbarHideDelay = 1000;
let animationFrame: number | undefined;
let hideTimeout: number | undefined;
let resizeObserver: ResizeObserver | undefined;

function updateThumb(): void {
  const element = viewport.value;
  if (!element) return;

  const { clientHeight, scrollHeight, scrollTop } = element;
  hasOverflow.value = scrollHeight > clientHeight;

  if (!hasOverflow.value) return;

  thumbHeight.value = Math.max(24, (clientHeight * clientHeight) / scrollHeight);
  thumbTop.value = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbHeight.value);
}

function scheduleThumbUpdate(): void {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(() => {
    animationFrame = undefined;
    updateThumb();
  });
}

function handleScroll(): void {
  updateThumb();
  isScrollbarVisible.value = true;

  if (hideTimeout !== undefined) window.clearTimeout(hideTimeout);
  hideTimeout = window.setTimeout(() => {
    hideTimeout = undefined;
    isScrollbarVisible.value = false;
  }, scrollbarHideDelay);
}

function ensureElementVisible(element: HTMLElement): void {
  const container = viewport.value;
  if (!container || !container.contains(element)) return;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  if (elementRect.top < containerRect.top) {
    container.scrollTop += elementRect.top - containerRect.top;
  } else if (elementRect.bottom > containerRect.bottom) {
    container.scrollTop += elementRect.bottom - containerRect.bottom;
  } else {
    return;
  }

  handleScroll();
}

defineExpose({ ensureElementVisible, getViewport: () => viewport.value });

onMounted(() => {
  const element = viewport.value;
  if (!element) return;

  resizeObserver = new ResizeObserver(scheduleThumbUpdate);
  resizeObserver.observe(element);
  if (content.value) resizeObserver.observe(content.value);

  scheduleThumbUpdate();
});

onBeforeUnmount(() => {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  if (hideTimeout !== undefined) window.clearTimeout(hideTimeout);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="overlay-scroll-area">
    <div ref="viewport" class="overlay-scroll-viewport" @scroll="handleScroll">
      <div ref="content" class="overlay-scroll-content"><slot /></div>
    </div>
    <div
      v-if="hasOverflow"
      class="overlay-scroll-thumb"
      :class="{ visible: isScrollbarVisible }"
      :style="{ height: `${thumbHeight}px`, transform: `translateY(${thumbTop}px)` }"
      aria-hidden="true"
    ></div>
  </div>
</template>

<style scoped>
.overlay-scroll-area {
  position: relative;
  overflow: hidden;
}
.overlay-scroll-viewport {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}
.overlay-scroll-viewport::-webkit-scrollbar {
  display: none;
  width: 0;
}
.overlay-scroll-thumb {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0.125rem;
  width: 0.25rem;
  border-radius: 0.125rem;
  background: rgba(144, 147, 154, 0.32);
  opacity: 0;
  pointer-events: none;
  transition:
    background 120ms ease,
    opacity 200ms ease;
}
.overlay-scroll-thumb.visible {
  opacity: 1;
}
.overlay-scroll-area:hover .overlay-scroll-thumb {
  background: rgba(144, 147, 154, 0.5);
}
</style>
