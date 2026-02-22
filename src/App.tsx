import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { Button, Input, Card } from "@heroui/react";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <Card.Header className="flex flex-col gap-2 items-center">
          <Card.Title className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Welcome to Clawset
          </Card.Title>
          <div className="flex gap-4">
            <a href="https://vite.dev" target="_blank" rel="noreferrer">
              <img src="/vite.svg" className="w-12 h-12 transition-transform hover:scale-110" alt="Vite logo" />
            </a>
            <a href="https://tauri.app" target="_blank" rel="noreferrer">
              <img src="/tauri.svg" className="w-12 h-12 transition-transform hover:scale-110" alt="Tauri logo" />
            </a>
            <a href="https://react.dev" target="_blank" rel="noreferrer">
              <img src={reactLogo} className="w-12 h-12 transition-transform hover:scale-110" alt="React logo" />
            </a>
          </div>
        </Card.Header>
        <Card.Content>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              greet();
            }}
          >
            <Input
              id="greet-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name..."
            />
            <Button type="submit">
              Greet
            </Button>
          </form>
          {greetMsg && (
            <p className="mt-4 text-center text-success font-medium">{greetMsg}</p>
          )}
        </Card.Content>
      </Card>
    </main>
  );
}

export default App;
