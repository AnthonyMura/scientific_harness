export {};

declare global {
  interface Window {
    workbench?: {
      getConfig(): Promise<{ baseUrl: string; token: string }>;
      openFolderDialog(): Promise<string | null>;
    };
  }
}