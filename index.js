const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variáveis de ambiente que vamos configurar no Render
const D4SIGN_TOKEN = process.env.D4SIGN_TOKEN;
const D4SIGN_COFFER_UUID = process.env.D4SIGN_COFFER_UUID;
const D4SIGN_TEMPLATE_ID = process.env.D4SIGN_TEMPLATE_ID;
const APROVADOR_EMAIL = process.env.APROVADOR_EMAIL;
const D4SIGN_CRYPT_KEY = process.env.D4SIGN_CRYPT_KEY;

// Endpoint que vai receber o webhook da Clint
app.post("/webhook", async (req, res) => {
  console.log("\n--- Webhook Recebido da Clint! ---");
  console.log("Dados recebidos:", JSON.stringify(req.body, null, 2));
  
  const dealData = req.body;

  if (!dealData.contact_name || !dealData.contact_email) {
    console.error("Erro Crítico: 'contact_name' ou 'contact_email' não encontrados no webhook.");
    return res.status(400).send("Dados incompletos. Verifique o mapeamento de campos na Clint.");
  }

  try {
    // --- PASSO 1: Criar o documento a partir do template ---
    console.log("Passo 1: Criando documento na D4Sign...");
    
    // Preparar o payload
    const payload = {
      name_document: `Contrato - ${dealData.contact_name}`,
      templates: {
        [D4SIGN_TEMPLATE_ID]: {
          NOME_CLIENTE: dealData.contact_name,
          CPF_CNPJ: dealData.contact_doc,
          NACIONALIDADE: dealData.contact_nacionalidade,
          DATA_NASCIMENTO: dealData.contact_data_de_nascimento,
          ENDERECO: dealData.contact_endereco,
          EMAIL: dealData.contact_email,
          VALOR: dealData.deal_value,
          FIDELIDADE: dealData.deal_modalidade,
          NOME_PLANO: dealData.deal_plano_de_assinatura,
          TRIAL: dealData.deal_trial,
        },
      },
    };
    
    // URL da requisição
    const url = `https://sandbox.d4sign.com.br/api/v1/documents/${D4SIGN_COFFER_UUID}/makedocumentbytemplateword?tokenAPI=${D4SIGN_TOKEN}&cryptKey=${D4SIGN_CRYPT_KEY}`;
    
    // LOG DETALHADO
    console.log("\n=== DEBUG: Requisição para D4Sign ===");
    console.log("URL:", url);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("=====================================\n");
    
    const createDocResponse = await axios.post(url, payload);
    
    console.log("\n=== DEBUG: Resposta da D4Sign ===");
    console.log("Status:", createDocResponse.status);
    console.log("Data:", JSON.stringify(createDocResponse.data, null, 2));
    console.log("=================================\n");
    
    const docUuid = createDocResponse.data.uuid;
    console.log(`Documento criado com sucesso! UUID: ${docUuid}`);

    // --- PASSO 2: Adicionar os signatários ---
    console.log("Passo 2: Adicionando signatários...");
    const signers = [];
    if (APROVADOR_EMAIL) {
      signers.push({ email: APROVADOR_EMAIL, act: "2", foreign: "0" });
    }
    signers.push({ email: dealData.contact_email, act: "1", foreign: "0" });
    
    await axios.post(
      `https://sandbox.d4sign.com.br/api/v1/documents/${docUuid}/createlist?tokenAPI=${D4SIGN_TOKEN}&cryptKey=${D4SIGN_CRYPT_KEY}`,
      { signers: signers }
    );
    console.log(`Signatários adicionados: ${signers.map(s => s.email).join(", ")}`);

    // --- PASSO 3: Enviar o documento para assinatura ---
    console.log("Passo 3: Enviando para assinatura...");
    await axios.post(
      `https://sandbox.d4sign.com.br/api/v1/documents/${docUuid}/sendtosigner?tokenAPI=${D4SIGN_TOKEN}&cryptKey=${D4SIGN_CRYPT_KEY}`,
      {
        message: `Olá ${dealData.contact_name}! Segue o contrato do plano ${dealData.deal_plano_de_assinatura} para sua assinatura.`,
        skip_email: "0",
        workflow: "1",
      }
    );
    console.log("Documento enviado com sucesso!");

    res.status(200).json({ success: true, message: "Automação concluída!" });

  } catch (error) {
    console.error("\n--- ERRO NA AUTOMAÇÃO ---");
    console.error("Tipo de erro:", error.message);
    console.error("Detalhes completos:", error.response ? error.response.data : "Sem resposta da API");
    console.error("Status:", error.response ? error.response.status : "N/A");
    
    // LOG EXTRA DO ERRO
    if (error.response) {
      console.error("\n=== DEBUG: Resposta de Erro ===");
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("===============================\n");
    }
    
    res.status(500).json({ success: false, error: "Erro ao processar a automação." });
  }
});

app.get("/", (req, res) => res.send("Automação Clint <> D4Sign está rodando! ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
