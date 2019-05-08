import Vue from 'vue'
import Router from 'vue-router'
import MapboxMap from './views/MapboxMap.vue'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'home',
      component: MapboxMap
    },
  ]
})
