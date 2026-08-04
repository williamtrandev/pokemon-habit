// Cấu hình Metro cho app native.
//
// Repo chứa thêm thư mục `web/` (bản web dùng chung logic trong `src/`). `web/` có
// node_modules RIÊNG với bản react thứ hai. Metro quét từ gốc repo, nên nếu không chặn
// nó sẽ bò vào đó: bundle chậm và có thể resolve nhầm react.
//
// Ở đây chỉ loại `web/` khỏi tầm quét của Metro. Bản web không dùng Metro (dùng Vite),
// nên chặn hoàn toàn là an toàn.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

const webDir = path.join(__dirname, 'web').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  new RegExp(`^${webDir}${path.sep === '\\' ? '\\\\' : '/'}.*`),
];

module.exports = config;
