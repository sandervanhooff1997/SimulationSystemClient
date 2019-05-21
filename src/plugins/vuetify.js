import Vue from 'vue'
import Vuetify from 'vuetify/lib'
import 'vuetify/src/stylus/app.styl'

Vue.use(Vuetify, {
  theme: {
    primary: '#283593',
    secondary: '#9BC4BC',
    background: '#353535',
    accent: '#13C4A3',
    error: '#F8333C',
    success: '#13C4A3',
    warning: '#FDCA40'
  },
  iconfont: 'fa',
})
