export interface Model {
  id: string
  name: string
  description: string
}

export interface Provider {
  id: string
  name: string
  description: string
  models: Model[]
}



