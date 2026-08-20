const FONT_FACE_STYLE_ID = 'chordmaster-app-font-faces';

const APP_FONT_FACES = [
  {
    family: 'JianpuASCII',
    sources: [{ path: 'fonts/JianpuASCII.ttf', format: 'truetype' }]
  },
  {
    family: 'Bach',
    sources: [
      { path: 'fonts/BachRhythm.ttf', format: 'truetype' },
      { path: 'fonts/Bach41.ttf', format: 'truetype' },
      { path: 'fonts/Bach.ttf', format: 'truetype' }
    ]
  },
  {
    family: 'BachSlurs',
    sources: [{ path: 'fonts/BachSlurs.ttf', format: 'truetype' }]
  }
];

const getPublicAssetUrl = (path: string) => {
  const cleanPath = path.replace(/^\/+/, '');
  const baseUrl = import.meta.env.BASE_URL || '/';

  if (baseUrl === './') {
    const moduleUrl = import.meta.url;
    const assetsPathIndex = moduleUrl.lastIndexOf('/assets/');
    if (assetsPathIndex >= 0) {
      return `${moduleUrl.slice(0, assetsPathIndex + 1)}${cleanPath}`;
    }

    return new URL(cleanPath, window.location.origin).href;
  }

  return `${baseUrl.replace(/\/?$/, '/')}${cleanPath}`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
};

const getFontDataUrl = async (path: string) => {
  const response = await fetch(getPublicAssetUrl(path), { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load font asset: ${path}`);
  }
  const base64 = arrayBufferToBase64(await response.arrayBuffer());
  return `data:font/truetype;base64,${base64}`;
};

let appFontEmbedCssPromise: Promise<string> | null = null;

export const registerAppFontFaces = () => {
  if (typeof document === 'undefined' || document.getElementById(FONT_FACE_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = FONT_FACE_STYLE_ID;
  style.textContent = APP_FONT_FACES.map(({ family, sources }) => `
@font-face {
  font-family: '${family}';
  src: ${sources.map(({ path, format }) => `url('${getPublicAssetUrl(path)}') format('${format}')`).join(',\n       ')};
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
`).join('\n');

  document.head.appendChild(style);
};

export const getAppFontEmbedCSS = async () => {
  if (typeof window === 'undefined') {
    return '';
  }

  appFontEmbedCssPromise ??= (async () => {
    const fontFaces = await Promise.all(APP_FONT_FACES.map(async ({ family, sources }) => {
      const embeddedSourceResults = await Promise.allSettled(sources.map(async ({ path, format }) => (
        `url('${await getFontDataUrl(path)}') format('${format}')`
      )));
      const embeddedSources = embeddedSourceResults
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      if (embeddedSources.length === 0) {
        throw new Error(`Unable to embed font family: ${family}`);
      }

      return `
@font-face {
  font-family: '${family}';
  src: ${embeddedSources.join(',\n       ')};
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
`;
    }));

    return fontFaces.join('\n');
  })();

  return appFontEmbedCssPromise;
};

export const waitForAppFontsReady = async () => {
  if (typeof document === 'undefined' || !document.fonts) {
    return;
  }

  registerAppFontFaces();

  await Promise.allSettled([
    document.fonts.load('16px JianpuASCII'),
    document.fonts.load('16px Bach'),
    document.fonts.load('16px BachSlurs'),
  ]);
  await document.fonts.ready;
};
