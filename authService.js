import { supabase } from './supabaseClient.js'

// Função de Cadastro
export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
}

// Função de Login
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
}

// Função de Logout
export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
}

// Obter usuário atual logado
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

// Salvar simulação de câmbio no Banco de Dados
export async function saveSimulation(simulationData) {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error("Você precisa estar logado para salvar simulações.")
    }

    const { data, error } = await supabase
        .from('currency_simulations')
        .insert([
            {
                user_id: user.id,
                from_currency: simulationData.from,
                to_currency: simulationData.to,
                amount: simulationData.amount,
                result: simulationData.result,
                rate: simulationData.rate
            }
        ])
        .select()

    if (error) {
        console.error("Erro ao salvar simulação:", error.message)
        throw error
    }
    return data[0]
}