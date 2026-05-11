import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            'AIzaSyCteU0NzqHKfJI8a4IZL_OC9YV_Paw7Pvs',
  authDomain:        'chatboot-infraestructura.firebaseapp.com',
  projectId:         'chatboot-infraestructura',
  storageBucket:     'chatboot-infraestructura.firebasestorage.app',
  messagingSenderId: '9738095222',
  appId:             '1:9738095222:web:a5ac492abbb4165321ed57',
}

const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
