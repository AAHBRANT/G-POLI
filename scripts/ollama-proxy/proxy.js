// Proxy de autenticação na frente do Ollama.
//
// Ollama (localhost:11434) não tem senha própria. Este proxy fica entre a
// internet (via Tailscale Funnel) e o Ollama: só repassa a requisição se o
// header Authorization bater com o segredo combinado. Sem isso, expor o
// Ollama direto pela Funnel deixaria qualquer pessoa na internet usar (ou
// apagar) os modelos.
//
// Uso (na máquina do Ollama):
//   set OLLAMA_PROXY_SECRET=<mesmo valor salvo em .secrets-migracao/ollama-proxy-secret.txt>
//   node proxy.js
//
// Depois: tailscale funnel 8787   (expõe ESTE proxy, nunca a porta 11434 direto)

const http = require("http");

const SECRET = process.env.OLLAMA_PROXY_SECRET;
const PORTA = Number(process.env.OLLAMA_PROXY_PORT || 8787);
const OLLAMA_PORTA = Number(process.env.OLLAMA_PORT || 11434);

if (!SECRET) {
  console.error("Defina OLLAMA_PROXY_SECRET antes de rodar.");
  process.exit(1);
}

const servidor = http.createServer((req, res) => {
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${SECRET}`) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ erro: "Não autorizado" }));
    return;
  }

  const upstream = http.request(
    { hostname: "localhost", port: OLLAMA_PORTA, path: req.url, method: req.method, headers: req.headers },
    (respostaUpstream) => {
      res.writeHead(respostaUpstream.statusCode || 502, respostaUpstream.headers);
      respostaUpstream.pipe(res);
    },
  );
  upstream.on("error", (erro) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ erro: `Falha ao alcançar o Ollama: ${erro.message}` }));
  });
  req.pipe(upstream);
});

servidor.listen(PORTA, () => {
  console.log(`Proxy de autenticação do Ollama escutando em :${PORTA} (repassa para :${OLLAMA_PORTA})`);
});
