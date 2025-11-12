const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variáveis de ambiente que vamos configurar no Render
const D4SIGN_TOKEN = process.env.D4SIGN_TOKEN;
const D4SIGN_COFFER_UUID = process.env.D4SIGN_COFFER_UUID;
const D4SIGN_TEMPLATE_ID = process.env.D4SIGN_TEMPLATE_ID;
const APROVADOR_EMAIL = process.env.APROVADOR_EMAIL; // Email do aprovador interno (opcional)

// Endpoint que vai receber o webhook da Clint
app.post("/webhook", async (req, res) => {
  console.log("Webhook recebido da Clint!");
  console.log("Dados recebidos:", JSON.stringify(req.body, null, 2));
  
  const dealData = req.body;

  // Verifique se os dados essenciais chegaram
  if (!dealData.contact_name || !dealData.contact_email) {
    console.error("Erro: Dados essenciais do cliente não encontrados no webhook.");
    return res.status(400).send("Dados incompletos - faltam nome ou email do cliente.");
  }

  try {
    // --- PASSO 1: Criar o documento a partir do template ---
    console.log("Passo 1: Criando documento na D4Sign...");
    const createDocResponse = await axios.post(
      `https://secure.d4sign.com.br/api/v1/documents/${D4SIGN_COFFER_UUID}/makedocumentbytemplateword?tokenAPI=${D4SIGN_TOKEN}`,
      {
        name_document: `Contrato - ${dealData.contact_name}`,
        templates: {
          [D4SIGN_TEMPLATE_ID]: {
            // Dados do Contato
            NOME_CLIENTE: dealData.contact_name,
            CPF_CNPJ: dealData.contact_doc,
            NACIONALIDADE: dealData.contact_nacionalidade,
            DATA_NASCIMENTO: dealData.contact_data_de_nascimento,
            ENDERECO: dealData.contact_endereco,
            EMAIL: dealData.contact_email,
            
            // Dados do Negócio/Plano
            VALOR: dealData.deal_value,
            FIDELIDADE: dealData.deal_modalidade,
            NOME_PLANO: dealData.deal_plano_de_assinatura,
            TRIAL: dealData.deal_trial,
          },
        },
      }
     );
    
    const docUuid = createDocResponse.data.uuid_document;
    console.log(`Documento criado com sucesso! UUID: ${docUuid}`);

    // --- PASSO 2: Adicionar os signatários ---
    console.log("Passo 2: Adicionando signatários...");
    
    const signers = [];
    
    // Se houver aprovador interno, adiciona primeiro (act: "2" = aprovador)
    if (APROVADOR_EMAIL) {
      signers.push({
        email: APROVADOR_EMAIL,
        act: "2", // Aprovador
        foreign: "0"
      });
    }
    
    // Adiciona o cliente como assinante (act: "1" = assinante)
    signers.push({
      email: dealData.contact_email,
      act: "1", // Assinante
      foreign: "0"
    });
    
    await axios.post(
      `https://secure.d4sign.com.br/api/v1/documents/${docUuid}/createlist?tokenAPI=${D4SIGN_TOKEN}`,
      { signers: signers }
     );
    console.log(`Signatários adicionados: ${signers.map(s => s.email).join(", ")}`);

    // --- PASSO 3: Enviar o documento para assinatura ---
    console.log("Passo 3: Enviando para assinatura...");
    await axios.post(
      `https://secure.d4sign.com.br/api/v1/documents/${docUuid}/sendtosigner?tokenAPI=${D4SIGN_TOKEN}`,
      {
        message: `Olá ${dealData.contact_name}! Segue o contrato do plano ${dealData.deal_plano_de_assinatura} para sua assinatura.`,
        skip_email: "0", // Envia email
        workflow: "1", // Respeita a ordem (aprovador -> assinante )
      }
    );
    console.log("Documento enviado com sucesso!");

    res.status(200).json({ 
      success: true, 
      message: "Automação concluída com sucesso!",
      document_uuid: docUuid 
    });

  } catch (error) {
    console.error("Ocorreu um erro na automação:");
    console.error("Detalhes:", error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      error: "Erro ao processar a automação.",
      details: error.response ? error.response.data : error.message
    });
  }
});

// Endpoint de health check (para verificar se o serviço está rodando)
app.get("/", (req, res) => {
  res.send("Automação Clint <> D4Sign está rodando! ✅");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// O Render vai nos fornecer a porta correta
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📝 Endpoint webhook: POST /webhook`);
});
