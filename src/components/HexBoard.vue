<script setup lang="ts">
import { computed, ref } from 'vue';
import { centerOf, keyOf, verticesOf } from '../geometry/hex';
import type { Axial } from '../geometry/hex';
import type { BoardResult } from '../geometry/visibility';

const props = defineProps<{
  board: BoardResult;
  blockers: ReadonlySet<string>;
  blockerHeights: ReadonlyMap<string, number>;
  selectedKey: string | null;
}>();

const emit = defineEmits<{ (e: 'cellClick', cell: Axial): void }>();

const S = 26; // 像素 / 整数平面单位
const zoom = ref(1);

const sx = (x: bigint) => Number(x) * S;
const sy = (y: bigint) => -Number(y) * S; // 屏幕 y 轴向下，翻转

interface CellView {
  cell: Axial;
  key: string;
  points: string;
  cx: number;
  cy: number;
  label: string;
  visible: boolean;
  isObserver: boolean;
  isBlocker: boolean;
}

const cells = computed<CellView[]>(() => {
  const obsKey = keyOf(props.board.observer);
  return props.board.cells.map((cell) => {
    const key = keyOf(cell);
    const ctr = centerOf(cell);
    const verdict = props.board.verdicts.get(key);
    return {
      cell,
      key,
      points: verticesOf(cell)
        .map((v) => `${sx(v.x)},${sy(v.y)}`)
        .join(' '),
      cx: sx(ctr.x),
      cy: sy(ctr.y),
      label: props.blockers.has(key) ? `${cell.q},${cell.r} ↑${props.blockerHeights.get(key) ?? 4}` : `${cell.q},${cell.r}`,
      visible: verdict?.visible ?? false,
      isObserver: key === obsKey,
      isBlocker: props.blockers.has(key) && key !== obsKey,
    };
  });
});

const viewBox = computed(() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of props.board.cells) {
    for (const v of verticesOf(c)) {
      minX = Math.min(minX, sx(v.x));
      maxX = Math.max(maxX, sx(v.x));
      minY = Math.min(minY, sy(v.y));
      maxY = Math.max(maxY, sy(v.y));
    }
  }
  const m = 1.2 * S;
  return `${minX - m} ${minY - m} ${maxX - minX + 2 * m} ${maxY - minY + 2 * m}`;
});

const selectedVerdict = computed(() =>
  props.selectedKey ? (props.board.verdicts.get(props.selectedKey) ?? null) : null,
);

const losLine = computed(() => {
  const v = selectedVerdict.value;
  if (!v) return null;
  const o = centerOf(props.board.observer);
  const t = centerOf(v.cell);
  return { x1: sx(o.x), y1: sy(o.y), x2: sx(t.x), y2: sy(t.y) };
});

const hitDots = computed(() => {
  const v = selectedVerdict.value;
  if (!v) return [];
  return v.hits.map((h, i) => ({
    key: `${keyOf(h.cell)}#${i}`,
    x: h.point.x.toNumber() * S,
    y: -h.point.y.toNumber() * S,
    first: i === 0,
  }));
});

const firstBlockerKey = computed(() => {
  const f = selectedVerdict.value?.first;
  return f ? keyOf(f.cell) : null;
});

function cellClass(c: CellView) {
  return {
    observer: c.isObserver,
    blocker: c.isBlocker,
    visible: !c.isObserver && !c.isBlocker && c.visible,
    occluded: !c.isObserver && !c.isBlocker && !c.visible,
    selected: c.key === props.selectedKey,
    'first-blocker': c.key === firstBlockerKey.value,
  };
}

function zoomBy(f: number) {
  zoom.value = Math.min(4, Math.max(0.3, zoom.value * f));
}

function onWheel(e: WheelEvent) {
  zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2);
}
</script>

<template>
  <div class="board-wrap">
    <div class="zoom-bar">
      <button @click="zoomBy(1.25)">＋</button>
      <button @click="zoomBy(0.8)">－</button>
      <span>{{ Math.round(zoom * 100) }}%</span>
    </div>
    <div class="legend">
      <span><i class="sw observer" />观察点</span>
      <span><i class="sw visible" />可见</span>
      <span><i class="sw occluded" />不可见</span>
      <span><i class="sw blocker" />阻挡</span>
      <span><i class="sw first" />最先遮挡</span>
    </div>
    <svg :viewBox="viewBox" @wheel.prevent="onWheel">
      <g :transform="`scale(${zoom})`">
        <polygon
          v-for="c in cells"
          :key="c.key"
          :points="c.points"
          class="cell"
          :class="cellClass(c)"
          @click="emit('cellClick', c.cell)"
        />
        <text
          v-for="c in cells"
          :key="'t' + c.key"
          :x="c.cx"
          :y="c.cy"
          class="label"
        >{{ c.label }}</text>
        <line v-if="losLine" v-bind="losLine" class="los" />
        <circle
          v-for="d in hitDots"
          :key="d.key"
          :cx="d.x"
          :cy="d.y"
          :r="d.first ? 7 : 4"
          :class="d.first ? 'hit first' : 'hit'"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.board-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}

svg {
  width: 100%;
  height: 100%;
  display: block;
  background: #191d23;
}

.zoom-bar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #9aa5b1;
}

.legend {
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 2;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #9aa5b1;
  background: rgba(20, 23, 28, 0.75);
  padding: 4px 8px;
  border-radius: 4px;
}

.legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sw {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 2px;
}

.sw.observer { background: #1d3a5f; }
.sw.visible { background: #1e3d2b; }
.sw.occluded { background: #232830; }
.sw.blocker { background: #4d2626; }
.sw.first { background: #ff7a45; }

.cell {
  fill: #232830;
  stroke: #3a4150;
  stroke-width: 1.5;
  cursor: pointer;
}

.cell.visible { fill: #1e3d2b; }
.cell.occluded { fill: #232830; }
.cell.blocker { fill: #4d2626; stroke: #8a4a4a; }
.cell.observer { fill: #1d3a5f; stroke: #4d8fd1; }
.cell.selected { stroke: #ffd75e; stroke-width: 3; }
.cell.first-blocker { stroke: #ff7a45; stroke-width: 3.5; }
.cell:hover { stroke: #9db4d0; }

.label {
  font-size: 11px;
  fill: #7d8794;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
  user-select: none;
}

.los {
  stroke: #ffd75e;
  stroke-width: 2;
  stroke-dasharray: 8 6;
  pointer-events: none;
}

.hit {
  fill: #d05ce8;
  pointer-events: none;
}

.hit.first {
  fill: #ff4d6d;
  stroke: #ffffff;
  stroke-width: 1.5;
}
</style>
