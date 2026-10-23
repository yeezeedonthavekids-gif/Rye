import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/pages.css';
import { PagesApp } from './pages/App';

createRoot(document.getElementById('root')!).render(<PagesApp />);
