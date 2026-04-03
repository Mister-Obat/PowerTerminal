import { app } from 'electron';
console.log('main loaded');
app.whenReady().then(() => { console.log('ready'); app.quit(); });
