// 生成在微信开发者工具控制台运行的只读验收脚本；不读取凭据、不上传、不改云权限。
const fs = require('fs'), path = require('path');
const { buildCatalog } = require('./buildAssetCatalog');
const { manifest } = buildCatalog();
const out = path.resolve(__dirname, '../node_modules/.cache/asset-release/verify-cloud.js');
const code = `(async () => {
  const manifest = ${JSON.stringify(manifest)};
  wx.cloud.init({ env: manifest.storage.envId, traceUser: false });
  const fs = wx.getFileSystemManager(), results = [], remaining = manifest.assets.slice();
  async function check(asset) {
    let task;
    const result = await new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, value) => { if(done)return; done=true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { finish(Error('download timeout')); task?.abort(); }, 20000);
      try { task = wx.cloud.downloadFile({ fileID: asset.fileID, success: r => finish(null, r), fail: e => finish(e) }); }
      catch(error) { finish(error); }
    });
    if(result.statusCode !== 200)throw Error('status '+result.statusCode);
    const info = await new Promise((resolve, reject) => fs.getFileInfo({ filePath: result.tempFilePath, digestAlgorithm: 'md5', success: resolve, fail: reject }));
    if(info.size !== asset.bytes || info.digest?.toLowerCase() !== asset.md5)throw Error('bytes/MD5 mismatch');
    return {path:asset.path, ok:true, bytes:info.size};
  }
  await Promise.all([0,1,2].map(async () => {
    while(remaining.length) { const asset=remaining.shift(); try { results.push(await check(asset)); }
      catch(error) { results.push({path:asset.path,ok:false,error:String(error.errMsg||error.message||error)}); } }
  }));
  results.sort((a,b)=>a.path.localeCompare(b.path));console.table(results);
  const report={allPassed:results.length===manifest.assetCount&&results.every(r=>r.ok),checked:results.length,expected:manifest.assetCount,results};
  console.log('[Cloud asset verification]',report);return report;
})();\n`;
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, code);
new Function(code);
console.log('在微信开发者工具控制台运行此文件内容（仅下载并校验20项资源）: ' + out);
