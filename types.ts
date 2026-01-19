export enum PriorityLevel {
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAIXA = 'BAIXA'
}

export enum Category {
  DEV = 'Dev',
  DADOS = 'Dados',
  INFRA = 'Infra',
  PESQUISA = 'Pesquisa'
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  category: Category;
  priority: PriorityLevel;
  justification: string;
  project: string;
  assignees: string[];
  createdAt: number;
  comments: Comment[];
  progress?: number;
}

export interface PrioritizationResult {
  tasks: {
    id: string;
    task: string;
    category: Category;
    priority: PriorityLevel;
    justification: string;
  }[];
  blockers: string[];
}