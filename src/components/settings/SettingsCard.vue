<template>
  <div class="settings-card"><slot /></div>
</template>

<style scoped>
.settings-card {
  overflow: hidden;
  border: 1px solid #33353a;
  border-radius: 10px;
  background: #121315;
}
.settings-card :deep(> * + *) {
  border-top: 1px solid #33353a;
}
</style>
