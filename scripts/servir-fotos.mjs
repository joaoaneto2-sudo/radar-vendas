// Servidor local so de leitura das fotos do estoque (pasta Estoque Principal) para o Radar de teste
// mostrar as imagens que estao no computador. Nao mexe em banco nem em arquivo. Uso:
// node scripts/servir-fotos.mjs   (porta 4550, ou FOTOS_PORT)

import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const PORT = Number(process.env.FOTOS_PORT || 4550);
const RAIZ = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const TIPOS = { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

http
  .createServer((req, res) => {
    const alvo = path.join(RAIZ, decodeURIComponent(req.url.split("?")[0]));
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(alvo, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("nao encontrado");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(alvo).toLowerCase()] || "image/jpeg",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Fotos em http://localhost:${PORT}`));
