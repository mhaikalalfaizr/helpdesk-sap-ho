import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_APP_NAME} - Sistem Pengajuan Dokumen HO`,
  description: 'Sistem Pengajuan Dokumen HO',
};

const ptpn4Theme = createTheme({ 
  fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',

  black: '#1e293b',

  colors: {
    ptpn4Green: [
      '#eef8f4', '#daf0e5', '#b3e1cb', '#87cfac', '#5fbc8f',
      '#41a877', '#309364', '#1f7d52', '#166541', '#0e422a', 
    ],
    ptpn4Orange: [
      '#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078', '#ffa94d', 
      '#ff922b', '#fd7e14', '#f76707', '#e8590c', '#d9480f'
    ],
    slateClean: [
      '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', 
      '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'
    ]
  },

  primaryColor: 'ptpn4Green',

  components: {
    Card: {
      defaultProps: {
        bg: '#ffffff',
        radius: 'lg',
        padding: 'xl',
      },
      styles: {
        root: {
          boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
          border: '1px solid rgba(226, 232, 240, 0.6)',
        }
      }
    },

    Button: {
      defaultProps: {
        radius: 'md',
        fw: 600,
      }
    }
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      </head>
      <body 
        suppressHydrationWarning 
        style={{ backgroundColor: '#f1f5f9', margin: 0 }}
      >
        <MantineProvider theme={ptpn4Theme} defaultColorScheme="light"> 
          <Notifications position="top-right" zIndex={1000} />
          <main style={{ minHeight: '100vh' }}>
            {children}
          </main>
        </MantineProvider>
      </body>
    </html>
  );
}