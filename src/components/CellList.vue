<script setup lang="ts">
import { computed } from 'vue';
import { keyOf } from '../geometry/hex';
import type { BoardResult } from '../geometry/visibility';

const props = defineProps<{
  board: BoardResult;
  blockers: ReadonlySet<string>;
  blockerHeights: ReadonlyMap<string, number>;
  selectedKey: string | null;
}>();

const emit = defineEmits<{ (e: 'select', key: string | null): void }>();

const rows = computed(() => {
  const obsKey = keyOf(props.board.observer);
  return props.board.cells.map((cell) => {
    const key = keyOf(cell);
    const v = props.board.verdicts.get(key);
    return {
      key,
      cell,
      isObserver: key === obsKey,
      isBlocker: props.blockers.has(key) && key !== obsKey,
      visible: v?.visible ?? false,
      hits: v?.hits.length ?? 0,
    };
  });
});

const stats = computed(() => {
  let vis = 0;
  let occ = 0;
  for (const r of rows.value) {
    if (r.isObserver || r.isBlocker) continue;
    if (r.visible) vis++;
    else occ++;
  }
  return { vis, occ, blockers: props.blockers.size };
});

// 与画布同一份 board：这里只读取，不重算几何
const detail = computed(() =>
  props.selectedKey ? (props.board.verdicts.get(props.selectedKey) ?? null) : null,
);

function onRow(key: string, isObserver: boolean) {
  if (isObserver) return;
  emit('select', key === props.selectedKey ? null : key);
}
</script>

<template>
  <aside class="panel">
    <div class="stats">
      可见 {{ stats.vis }} · 不可见 {{ stats.occ }} · 阻挡 {{ stats.blockers }}
    </div>

    <div v-if="detail" class="detail">
      <div class="title">
        目标 ({{ detail.cell.q }}, {{ detail.cell.r }})：
        <b :class="detail.visible ? 'ok' : 'bad'">{{ detail.visible ? '可见' : '被遮挡' }}</b>
      </div>
      <template v-if="detail.first">
        <div>最先遮挡格：<b class="bad">({{ detail.first.cell.q }}, {{ detail.first.cell.r }})</b></div>
        <div>交入参数 t = {{ detail.first.t.toString() }}</div>
        <div>
          有理交入位置 ({{ detail.first.point.x.toString() }}, {{ detail.first.point.y.toString() }})
        </div>
        <ol class="hits">
          <li v-for="(h, i) in detail.hits" :key="i">
            ({{ h.cell.q }}, {{ h.cell.r }}) · t={{ h.t.toString() }} · ({{ h.point.x.toString() }},
            {{ h.point.y.toString() }})
          </li>
        </ol>
      </template>
    </div>

    <table>
      <thead>
        <tr>
          <th>格 (q, r)</th>
          <th>状态</th>
          <th>遮挡数</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.key"
          :class="{
            sel: r.key === selectedKey,
            obs: r.isObserver,
            blk: r.isBlocker,
            occ: !r.isObserver && !r.isBlocker && !r.visible,
          }"
          @click="onRow(r.key, r.isObserver)"
        >
          <td>({{ r.cell.q }}, {{ r.cell.r }})<span v-if="r.isBlocker"> ↑{{ blockerHeights.get(r.key) ?? 4 }}</span></td>
          <td>
            <span v-if="r.isObserver">观察点</span>
            <span v-else-if="r.isBlocker">阻挡</span>
            <span v-else :class="r.visible ? 'ok' : 'bad'">{{ r.visible ? '可见' : '被遮挡' }}</span>
          </td>
          <td>{{ r.isObserver ? '—' : r.hits }}</td>
        </tr>
      </tbody>
    </table>
  </aside>
</template>

<style scoped>
.panel {
  width: 360px;
  border-left: 1px solid #2c333d;
  background: #171b21;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 13px;
}

.stats {
  color: #9aa5b1;
  margin-bottom: 8px;
}

.detail {
  background: #1d232b;
  border: 1px solid #2c333d;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  line-height: 1.7;
}

.detail .title {
  margin-bottom: 2px;
}

.hits {
  margin: 6px 0 0;
  padding-left: 20px;
  color: #9aa5b1;
  font-size: 12px;
}

.ok { color: #5fce8a; }
.bad { color: #ff7a45; }

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 3px 6px;
  border-bottom: 1px solid #232a33;
}

th {
  color: #7d8794;
  font-weight: 500;
  position: sticky;
  top: -10px;
  background: #171b21;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: #1d232b;
}

tr.sel {
  background: #24334a;
}

tr.obs td {
  color: #6fa8dc;
}

tr.blk td {
  color: #c07a7a;
}

tr.occ td {
  color: #8a929e;
}
</style>
