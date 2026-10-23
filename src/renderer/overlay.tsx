import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/overlay.css';
import { OverlayApp } from './overlay/App';

createRoot(document.getElementById('root')!).render(<OverlayApp />);
