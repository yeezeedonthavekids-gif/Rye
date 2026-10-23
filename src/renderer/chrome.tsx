import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/chrome.css';
import { ChromeApp } from './chrome/App';

createRoot(document.getElementById('root')!).render(<ChromeApp />);
