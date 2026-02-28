export function MainContent() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
      <h2 className="text-2xl font-bold mb-2">No Instance Selected</h2>
      <p className="text-default-500 text-center max-w-sm">
        Select an instance from the header above to view its Dashboard, Info, or configuration layout.
      </p>
    </div>
  );
}
