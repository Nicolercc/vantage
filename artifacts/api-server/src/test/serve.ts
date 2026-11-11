// Starts the real app in its own process for tests that must observe the
// process itself (for example, that a request cannot crash it). Prints the port.
import app from "../app";

const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address === "object") process.stdout.write(`${address.port}\n`);
});
