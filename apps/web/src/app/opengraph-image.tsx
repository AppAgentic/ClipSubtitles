import { ImageResponse } from 'next/og';

export const alt = 'ClipSubtitles — AI video caption generator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#f5f5f7',
        color: '#141419',
        padding: '70px 76px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', width: '100%', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>ClipSubtitles</div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 56,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div
              style={{
                display: 'flex',
                color: '#3155f5',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 1.5,
              }}
            >
              AI VIDEO CAPTION GENERATOR
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontSize: 68,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: -3,
              }}
            >
              Add captions to videos with your AI agent.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              width: 280,
              height: 360,
              borderRadius: 32,
              background: '#17171d',
              padding: 26,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 22px 60px rgba(25, 28, 45, 0.18)',
            }}
          >
            <div
              style={{
                display: 'flex',
                borderRadius: 999,
                background: '#3155f5',
                color: 'white',
                padding: '15px 22px',
                fontSize: 25,
                fontWeight: 800,
                textAlign: 'center',
              }}
            >
              READY TO POST
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
