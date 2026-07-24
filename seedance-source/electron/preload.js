'use strict';
const { contextBridge } = require('electron');

// 预留:如需向页面暴露桌面能力(选择本地文件、打开目录等)在此扩展
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
});
