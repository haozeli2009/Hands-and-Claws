import { useThemeStore } from '../store/themeStore'

const LIGHT = {
  bg:          '#fafafa',
  surface:     '#ffffff',
  surface2:    '#f3f4f6',
  ink:         '#1a1a1a',
  ink2:        '#3a3a3a',
  ink3:        '#666666',
  ink4:        '#999999',
  line:        '#e5e5e5',
  inputBg:     '#ffffff',
  inputBorder: '#dddddd',
  btnBorder:   '#dddddd',
  btnColor:    '#555555',
  // accent soft backgrounds
  agentSoft:   '#f5f3ff',
  agentLine:   '#ddd6f7',
  greenSoft:   '#f0fdf4',
  blueSoft:    '#eff6ff',
  amberSoft:   '#fffbf0',
  dark:        false,
}

const DARK = {
  bg:          '#111111',
  surface:     '#1c1c1c',
  surface2:    '#252525',
  ink:         '#e8e8e8',
  ink2:        '#cccccc',
  ink3:        '#999999',
  ink4:        '#666666',
  line:        '#2e2e2e',
  inputBg:     '#222222',
  inputBorder: '#3a3a3a',
  btnBorder:   '#3a3a3a',
  btnColor:    '#aaaaaa',
  // accent soft backgrounds (dark-mode tints)
  agentSoft:   'rgba(124,92,191,0.15)',
  agentLine:   'rgba(124,92,191,0.35)',
  greenSoft:   'rgba(34,197,94,0.1)',
  blueSoft:    'rgba(0,112,243,0.12)',
  amberSoft:   'rgba(180,83,9,0.12)',
  dark:        true,
}

export function useTheme() {
  const dark = useThemeStore(s => s.dark)
  return dark ? DARK : LIGHT
}
