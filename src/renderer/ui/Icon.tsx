// One icon registry for the whole app, so menus built in the main process can
// reference icons by name and every surface draws them at the same weight.
import {
  AppWindow, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, Bell, BookPlus, Bookmark, Camera, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleAlert, Clipboard, Clock, ClockArrowLeft, Code, Cookie, Copy, CornerDownLeft, Download, Ellipsis,
  ExternalLink, File, Folder, FolderDown, Gauge, Globe, GripVertical, House, Image, Info, Keyboard, Layers, LayoutGrid, Link, Lock,
  MapPin, Maximize, Maximize2, Mic, Minimize, Minimize2, Minus, Monitor, MonitorUp, Moon, Palette, PanelLeft, PanelLeftClose,
  PanelLeftOpen, PanelTop, Pause, Pencil, PictureInPicture2, Pin, PinOff, Play, Plus, Power, Printer, Puzzle, RotateCcw, RotateCw,
  ScanSearch, Search, Settings, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Square, Star, Sun, Trash,
  TriangleAlert, Type, Unplug, Upload, Usb, VenetianMask, Volume2, VolumeX, WifiOff, Wrench, X, ZoomIn, ZoomOut,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'app-window': AppWindow, 'arrow-down': ArrowDown, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-up': ArrowUp,
  ban: Ban, bell: Bell, 'book-plus': BookPlus, bookmark: Bookmark, camera: Camera, check: Check, 'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp, alert: CircleAlert, clipboard: Clipboard,
  clock: Clock, history: ClockArrowLeft, code: Code, cookie: Cookie, copy: Copy, 'corner-down-left': CornerDownLeft,
  download: Download, more: Ellipsis, external: ExternalLink, file: File, folder: Folder, 'folder-down': FolderDown, gauge: Gauge,
  globe: Globe, grip: GripVertical, home: House, image: Image, info: Info, keyboard: Keyboard, layers: Layers, grid: LayoutGrid,
  link: Link, lock: Lock, pin: Pin, 'pin-off': PinOff, 'map-pin': MapPin, maximize: Maximize, 'maximize-2': Maximize2, mic: Mic,
  minimize: Minimize, 'minimize-2': Minimize2, minus: Minus, monitor: Monitor, 'monitor-up': MonitorUp, moon: Moon,
  palette: Palette, 'panel-left': PanelLeft, 'panel-left-close': PanelLeftClose, 'panel-left-open': PanelLeftOpen,
  'panel-top': PanelTop, pause: Pause, pencil: Pencil, 'picture-in-picture-2': PictureInPicture2, play: Play, plus: Plus,
  power: Power, printer: Printer, puzzle: Puzzle, 'rotate-ccw': RotateCcw, 'rotate-cw': RotateCw, 'scan-search': ScanSearch,
  search: Search, settings: Settings, shield: Shield, 'shield-alert': ShieldAlert, 'shield-check': ShieldCheck,
  sliders: SlidersHorizontal, sparkles: Sparkles, square: Square, star: Star, sun: Sun, 'trash-2': Trash, trash: Trash,
  warning: TriangleAlert, type: Type, unplug: Unplug, upload: Upload, usb: Usb, 'venetian-mask': VenetianMask,
  'volume-2': Volume2, 'volume-x': VolumeX, 'wifi-off': WifiOff, wrench: Wrench, x: X, 'zoom-in': ZoomIn, 'zoom-out': ZoomOut,
};

export function Icon({ name, size = 16, stroke = 1.75, className, fill }: { name: string; size?: number; stroke?: number; className?: string; fill?: string }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C size={size} strokeWidth={stroke} className={className} fill={fill ?? 'none'} absoluteStrokeWidth={false} aria-hidden />;
}

/** The Rye mark: a soft lowercase "r" whose shoulder ends in a grain. */
export function RyeMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M8 19.5V11.4c0-2.9 2.1-5 4.8-5.2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="16.9" cy="6.9" rx="2.9" ry="1.85" transform="rotate(-28 16.9 6.9)" fill="currentColor" />
    </svg>
  );
}
