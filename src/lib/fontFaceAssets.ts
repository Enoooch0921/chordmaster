const FONT_FACE_STYLE_ID = 'chordmaster-app-font-faces';

const getPublicAssetUrl = (path: string) => {
  const cleanPath = path.replace(/^\/+/, '');
  const baseUrl = import.meta.env.BASE_URL || '/';

  if (baseUrl === './') {
    return new URL(cleanPath, document.baseURI).href;
  }

  return `${baseUrl.replace(/\/?$/, '/')}${cleanPath}`;
};

export const registerAppFontFaces = () => {
  if (typeof document === 'undefined' || document.getElementById(FONT_FACE_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = FONT_FACE_STYLE_ID;
  style.textContent = `
@font-face {
  font-family: 'JianpuASCII';
  src: url('${getPublicAssetUrl('fonts/JianpuASCII.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'Bach';
  src: url('${getPublicAssetUrl('fonts/BachRhythm.ttf')}') format('truetype'),
       url('${getPublicAssetUrl('fonts/Bach41.ttf')}') format('truetype'),
       url('${getPublicAssetUrl('fonts/Bach.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}

@font-face {
  font-family: 'BachSlurs';
  src: url('${getPublicAssetUrl('fonts/BachSlurs.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
`;

  document.head.appendChild(style);
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
