<script setup lang="ts">
import { computed, ref } from 'vue';
import HexBoard from './components/HexBoard.vue';
import CellList from './components/CellList.vue';
import { computeBoard } from './geometry/visibility';
import { boardCells, keyOf } from './geometry/hex';
import type { Axial } from './geometry/hex';

type Mode = 'target' | 'blocker' | 'observer';

const radius = ref(4);
const observer = ref<Axial>({ q: 0, r: 0 });
const blockerKeys = ref<ReadonlySet<string>>(new Set(['1,0', '0,1', '2,-1']));
const blockerHeights = ref<ReadonlyMap<string, number>>(new Map([['1,0', 4], ['0,1', 4], ['2,-1', 4]]));
const observerEye = ref(1);
const targetEye = ref(1);
const selectedKey = ref<string | null>('3,1');
const mode = ref<Mode>('target');

const cells = computed(() => boardCells(radius.value));

const blockers = computed<Axial[]>(() =>
  cells.value.filter(
    (c) =>
      blockerKeys.value.has(keyOf(c)) &&
      !(c.q === observer.value.q && c.r === observer.value.r),
  ),
);

// 画布与列表共用的唯一一份几何结果
const board = computed(() => computeBoard(radius.value, observer.value, blockers.value, 1, {
  observerEye: observerEye.value,
  targetEye: targetEye.value,
  blockerHeights: blockerHeights.value,
}));

const selectedBlockerHeight = computed(() =>
  selectedKey.value ? blockerHeights.value.get(selectedKey.value) : undefined,
);

function setSelectedBlockerHeight(e: Event) {
  if (!selectedKey.value || !blockerKeys.value.has(selectedKey.value)) return;
  const height = Math.min(8, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value))));
  const next = new Map(blockerHeights.value);
  next.set(selectedKey.value, height);
  blockerHeights.value = next;
}

const modeHint = computed(
  () =>
    ({
      target: '点击格子：选为目标',
      blocker: '点击格子：切换阻挡',
      observer: '点击格子：放置观察点',
    })[mode.value],
);

function onCellClick(cell: Axial) {
  const k = keyOf(cell);
  if (mode.value === 'observer') {
    observer.value = { ...cell };
    const next = new Set(blockerKeys.value);
    next.delete(k);
    blockerKeys.value = next;
    const heights = new Map(blockerHeights.value);
    heights.delete(k);
    blockerHeights.value = heights;
    if (selectedKey.value === k) selectedKey.value = null;
  } else if (mode.value === 'blocker') {
    if (k === keyOf(observer.value)) return;
    const next = new Set(blockerKeys.value);
    const heights = new Map(blockerHeights.value);
    if (next.has(k)) {
      next.delete(k);
      heights.delete(k);
    } else {
      next.add(k);
      heights.set(k, 4);
    }
    blockerKeys.value = next;
    blockerHeights.value = heights;
  } else {
    if (k === keyOf(observer.value)) return;
    selectedKey.value = k;
  }
}

function onSelect(key: string | null) {
  selectedKey.value = key;
}

function onRadius(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  const r = Math.min(12, Math.max(2, Math.round(v)));
  radius.value = r;
  // 裁剪越界状态
  const valid = new Set(boardCells(r).map(keyOf));
  blockerKeys.value = new Set([...blockerKeys.value].filter((k) => valid.has(k)));
  blockerHeights.value = new Map([...blockerHeights.value].filter(([k]) => valid.has(k)));
  if (!valid.has(keyOf(observer.value))) {
    observer.value = { q: 0, r: 0 };
    const next = new Set(blockerKeys.value);
    next.delete(keyOf(observer.value));
    blockerKeys.value = next;
    const heights = new Map(blockerHeights.value);
    heights.delete(keyOf(observer.value));
    blockerHeights.value = heights;
  }
  if (selectedKey.value && !valid.has(selectedKey.value)) selectedKey.value = null;
}

function clearBlockers() {
  blockerKeys.value = new Set();
  blockerHeights.value = new Map();
}

function resetObserver() {
  observer.value = { q: 0, r: 0 };
}
</script>

<template>
  <div class="app">
    <header>
      <h1>六角视线 · 精确有理几何</h1>
      <div class="controls">
        <label>
          半径
          <input type="number" min="2" max="12" :value="radius" @change="onRadius" />
        </label>
        <label>观察眼高 <input type="number" min="0" max="8" v-model.number="observerEye" /></label>
        <label>目标眼高 <input type="number" min="0" max="8" v-model.number="targetEye" /></label>
        <label v-if="selectedBlockerHeight !== undefined">
          选中阻挡格高度
          <input type="number" min="0" max="8" :value="selectedBlockerHeight" @change="setSelectedBlockerHeight" />
        </label>
        <div class="modes">
          <button :class="{ on: mode === 'target' }" @click="mode = 'target'">目标</button>
          <button :class="{ on: mode === 'blocker' }" @click="mode = 'blocker'">阻挡</button>
          <button :class="{ on: mode === 'observer' }" @click="mode = 'observer'">观察点</button>
        </div>
        <button @click="clearBlockers">清空阻挡</button>
        <button @click="resetObserver">重置观察点</button>
        <span class="hint">{{ modeHint }}</span>
      </div>
    </header>
    <main>
      <HexBoard
        :board="board"
        :blockers="blockerKeys"
        :blocker-heights="blockerHeights"
        :selected-key="selectedKey"
        @cell-click="onCellClick"
      />
      <CellList
        :board="board"
        :blockers="blockerKeys"
        :blocker-heights="blockerHeights"
        :selected-key="selectedKey"
        @select="onSelect"
      />
    </main>
    <footer>
      整数平面嵌入 (2q+r, 3r) · 开线段严格内部判定，纯边界接触不算遮挡 · 并列按交入位置、q、r 裁决 ·
      画布与列表共用同一份几何结果
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  padding: 8px 16px;
  background: #1b2027;
  border-bottom: 1px solid #2c333d;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

h1 {
  font-size: 16px;
  margin: 0;
  font-weight: 600;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 13px;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.modes {
  display: flex;
  gap: 4px;
}

.hint {
  color: #7d8794;
  font-size: 12px;
}

main {
  flex: 1;
  display: flex;
  min-height: 0;
}

footer {
  padding: 6px 16px;
  font-size: 12px;
  color: #7d8794;
  border-top: 1px solid #2c333d;
}
</style>
