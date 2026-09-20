// Module registry: React renderers, activity-bar icons and settings schemas.
// Settings schemas live with each component so the gear popover and the
// module share one source of truth.
import type { ComponentType } from "react";
import type { AppCtx } from "./ctx";
import type { Tab } from "./layout";
import type { ModuleSettings, SettingControl } from "./settings";
import type { IconProps } from "../icons";
import { DownloadIcon, EyeIcon, FileTextIcon, FolderIcon, OutlineIcon, TerminalIcon } from "../icons";
import FileExplorer, { EXPLORER_DEFAULTS, EXPLORER_SETTINGS } from "../components/FileExplorer";
import EditorPane, { EDITOR_DEFAULTS, EDITOR_SETTINGS } from "../components/EditorPane";
import PdfViewer, { PDF_DEFAULTS, PDF_SETTINGS } from "../components/PdfViewer";
import LogPanel, { LOG_DEFAULTS, LOG_SETTINGS } from "../components/LogPanel";
import InstallContent from "../components/InstallPanel";
import StructurePane, { STRUCTURE_DEFAULTS, STRUCTURE_SETTINGS } from "../components/StructurePane";

export interface ModuleEntry {
  icon: ComponentType<IconProps>;
  render: (ctx: AppCtx, tab: Tab) => React.ReactNode;
  settings: SettingControl[];
  defaults: ModuleSettings;
}

export const MODULES: Record<string, ModuleEntry> = {
  explorer: {
    icon: FolderIcon,
    render: (ctx) => <FileExplorer ctx={ctx} />,
    settings: EXPLORER_SETTINGS,
    defaults: EXPLORER_DEFAULTS,
  },
  structure: {
    icon: OutlineIcon,
    render: (ctx) => <StructurePane ctx={ctx} />,
    settings: STRUCTURE_SETTINGS,
    defaults: STRUCTURE_DEFAULTS,
  },
  editor: {
    icon: FileTextIcon,
    render: (ctx, tab) => (
      <EditorPane ctx={ctx} filePath={tab.params?.filePath ? String(tab.params.filePath) : null} />
    ),
    settings: EDITOR_SETTINGS,
    defaults: EDITOR_DEFAULTS,
  },
  pdf: {
    icon: EyeIcon,
    render: (ctx) => <PdfViewer ctx={ctx} />,
    settings: PDF_SETTINGS,
    defaults: PDF_DEFAULTS,
  },
  log: {
    icon: TerminalIcon,
    render: (ctx) => <LogPanel ctx={ctx} />,
    settings: LOG_SETTINGS,
    defaults: LOG_DEFAULTS,
  },
  install: {
    icon: DownloadIcon,
    render: (ctx) => <InstallContent ctx={ctx} />,
    settings: [],
    defaults: {},
  },
};
