<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'RouterOutlet',
  render(createElement) {
    return createElement('router-view');
  }
});
</script>
