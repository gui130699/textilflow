export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "textarea"
    | "select"
    | "date"
    | "checkbox"
    | "multi";
  options?: string[];
  collection?: string;
  required?: boolean;
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const contact = [
  f("contact", "Responsável / contato"),
  f("phone", "Telefone"),
  f("whatsapp", "WhatsApp"),
  f("email", "E-mail", "email"),
  f("address", "Endereço"),
  f("number", "Número"),
  f("complement", "Complemento"),
  f("neighborhood", "Bairro"),
  f("city", "Cidade"),
  f("state", "UF"),
  f("zip", "CEP"),
];
const legal = [
  f("legalName", "Razão social"),
  f("tradeName", "Nome fantasia"),
  f("taxId", "CPF/CNPJ (somente números)"),
  f("personType", "Tipo de pessoa", "select", {
    options: ["Jurídica", "Física"],
  }),
];
export const catalogs: Record<
  string,
  { label: string; singular: string; description: string; fields: Field[] }
> = {
  companies: {
    label: "Empresas",
    singular: "empresa",
    description: "Empresas que você acompanha, em um só lugar.",
    fields: [
      ...legal,
      f("stateRegistration", "Inscrição estadual"),
      ...contact,
    ],
  },
  clients: {
    label: "Clientes",
    singular: "cliente",
    description: "Organize os clientes comerciais da empresa.",
    fields: [...legal, ...contact],
  },
  thirdParties: {
    label: "Terceiros",
    singular: "terceiro",
    description: "Parceiros que fazem parte da sua produção.",
    fields: [
      ...legal,
      ...contact,
      f("services", "Serviços (separados por vírgula)"),
      f("averageDays", "Prazo médio em dias", "number"),
    ],
  },
  suppliers: {
    label: "Fornecedores",
    singular: "fornecedor",
    description: "Fornecedores de materiais e insumos.",
    fields: [...legal, ...contact],
  },
  materials: {
    label: "Materiais",
    singular: "material",
    description: "Matérias-primas, aviamentos e embalagens.",
    fields: [
      f("category", "Categoria", "select", {
        options: [
          "Malha",
          "Ribana",
          "Tecido",
          "Linha",
          "Etiqueta",
          "Elástico",
          "Aviamento",
          "Embalagem",
          "Outros",
        ],
        collection: "categories",
      }),
      f("type", "Tipo"),
      f("composition", "Composição"),
      f("color", "Cor"),
      f("unit", "Unidade", "select", {
        options: ["rolo", "quilograma", "metro", "unidade", "pacote"],
        collection: "units",
      }),
      f("supplierId", "Fornecedor", "select", { collection: "suppliers" }),
    ],
  },
  products: {
    label: "Produtos",
    singular: "produto",
    description: "Peças confeccionadas e suas classificações.",
    fields: [
      f("category", "Categoria", "select", {
        options: [
          "Camiseta manga curta",
          "Camiseta manga longa",
          "Regata",
          "Calça",
          "Bermuda",
          "Short",
          "Short-saia",
          "Moletom",
          "Casaco",
          "Outros",
        ],
      }),
    ],
  },
  models: {
    label: "Modelos",
    singular: "modelo",
    description: "Modelos e especificações técnicas dos produtos.",
    fields: [
      f("productId", "Produto", "select", {
        collection: "products",
        required: true,
      }),
      f("technicalNotes", "Observações técnicas", "textarea"),
    ],
  },
  modules: {
    label: "Módulos",
    singular: "módulo",
    description:
      "Configure a apresentação das etapas. Os controles de saldo são preservados.",
    fields: [
      f("order", "Ordem", "number"),
      f("operationalType", "Tipo operacional", "select", {
        options: [
          "recebimento",
          "inspecao",
          "modelagem",
          "corte",
          "estamparia",
          "costura",
          "embalagem",
          "despacho",
        ],
      }),
      f("required", "Etapa obrigatória", "checkbox"),
    ],
  },
  colors: {
    label: "Cores",
    singular: "cor",
    description: "Cores disponíveis para identificar lotes.",
    fields: [],
  },
  sizes: {
    label: "Tamanhos",
    singular: "tamanho",
    description: "Tamanhos alfanuméricos ou numéricos.",
    fields: [],
  },
  grades: {
    label: "Grades",
    singular: "grade",
    description: "Descreva as combinações de tamanhos nas observações.",
    fields: [],
  },
  units: {
    label: "Unidades de medida",
    singular: "unidade",
    description: "Unidades usadas nos cadastros de materiais.",
    fields: [],
  },
  categories: {
    label: "Categorias",
    singular: "categoria",
    description: "Classificações adicionais de materiais.",
    fields: [],
  },
  rejectionReasons: {
    label: "Motivos de reprovação",
    singular: "motivo",
    description: "Padronize os motivos de reprovação.",
    fields: [],
  },
  inspectionTypes: {
    label: "Tipos de inspeção",
    singular: "tipo de inspeção",
    description: "Classificações das inspeções de qualidade.",
    fields: [],
  },
};
export const accountLabels: Record<string, string> = {
  corte: "Corte pronto",
  "estampa-pronta": "Estampado pronto",
  "costura-pronta": "Costurado pronto",
  embalagem: "Em embalagem",
  embalado: "Embalado",
  despachado: "Despachado",
  quarentena: "Quarentena",
  perdas: "Perdas",
};
export const movementLabels: Record<string, string> = {
  cut: "Registrar corte",
  send: "Enviar a terceiro",
  receive: "Receber de terceiro",
  transfer: "Transferir / embalar",
  loss: "Registrar perda",
  dispatch: "Registrar despacho",
  reverse: "Estornar movimento",
};
