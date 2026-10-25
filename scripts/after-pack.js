'use strict';

/**
 * afterPack 钩子：为打包好的应用可执行文件写入自定义图标与版本信息。
 * 使用 resedit（纯 JS 的 PE 资源编辑器），无需 wine / 签名工具。
 */

const path = require('path');
const fs = require('fs');

const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');
const VERSION = '1.0.0.0';
const LANG = 1033; // en-US

exports.default = async function afterPack(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  if (!fs.existsSync(exePath) || !fs.existsSync(ICON_PATH)) {
    console.warn('  • skip icon patch (file or icon missing)');
    return;
  }

  const { load } = require('resedit/cjs');
  const RE = await load();
  const { NtExecutable, NtExecutableResource, Data, Resource } = RE;

  const exe = NtExecutable.from(fs.readFileSync(exePath));
  const res = NtExecutableResource.from(exe);

  // 1) 替换图标
  const iconFile = Data.IconFile.from(fs.readFileSync(ICON_PATH));
  const groupIds = Resource.IconGroupEntry.fromEntries(res.entries).map((e) => e.id);
  const groupId = groupIds.length ? groupIds[0] : 101;
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    LANG,
    iconFile.icons.map((item) => item.data)
  );

  // 2) 写入版本信息
  const viList = Resource.VersionInfo.fromEntries(res.entries);
  const vi = viList.length ? viList[0] : Resource.VersionInfo.createEmpty();
  vi.setFileVersion(1, 0, 0, 0, LANG);
  vi.setProductVersion(1, 0, 0, 0, LANG);
  vi.setStringValues(
    { lang: LANG, codepage: 1200 },
    {
      CompanyName: 'door-studio',
      FileDescription: 'PhotoChang 修图工具',
      FileVersion: VERSION,
      InternalName: 'PhotoChang',
      LegalCopyright: 'Copyright © 2026 door-studio',
      OriginalFilename: 'PhotoChang.exe',
      ProductName: 'PhotoChang',
      ProductVersion: VERSION
    }
  );
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • patched icon & version info: PhotoChang.exe');
};
