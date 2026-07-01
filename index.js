const express = require("express")
const knex = require("knex")
const http_errors = require("http-errors")
const jwt = require("jsonwebtoken")

// ==========================================
// CONFIGURAÇÃO INICIAL
// ==========================================
const PORT = 8001
const HOSTNAME = "localhost"
const JWT_SECRET = "seu_secret_jwt_aqui"

const api = express()
api.use( express.json() )
api.use( express.urlencoded( { extended : true } ) )

// Conexão com banco de dados MySQL via Knex
const conn = knex( {
    client : "mysql" ,
    connection : {
        host : HOSTNAME ,
        user : "root" ,
        password : "" ,
        database : "loja_26_1"
    }
} ) 

// ==========================================
// JWT: Gera token de autenticação
// Token válido por 7 dias com userId e email
// ==========================================
function generateToken(userId, email) {
    return jwt.sign(
        { userId, email },
        JWT_SECRET,
        { expiresIn: "7d" }
    )
}

// ==========================================
// JWT: Valida se token é legítimo e não expirou
// Retorna null se token inválido/expirado
// ==========================================
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET)
    } catch (err) {
        return null
    }
}

// ==========================================
// MIDDLEWARE: Protege endpoints que requerem autenticação
// Verifica se usuário tem token válido antes de deixar acessar
// Se válido, salva dados do usuário em req.user
// ==========================================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization
    
    if (!authHeader) {
        return next(http_errors(401, "Token não fornecido"))
    }

    // Extrai token do header "Authorization: Bearer TOKEN"
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader
    const decoded = verifyToken(token)

    if (!decoded) {
        return next(http_errors(401, "Token inválido ou expirado"))
    }

    req.user = decoded  // Agora outros endpoints podem acessar req.user.userId
    next()
}

// ==========================================
// HOME - Boas-vindas
// ==========================================
api.get( "/" , (req, res, next) => {
    res.json( { resposta : 'Seja bem-vindo(a) à nossa API de Links' } )
} )

// ==========================================
// AUTENTICAÇÃO: Registrar novo usuário
// POST /auth/register
// Body: { email, password, nome }
// Retorna: token JWT para usar em outros endpoints
// ==========================================
api.post( "/auth/register" , (req, res, next) => {
    const { email, password, nome } = req.body

    if (!email || !password || !nome) {
        return next(http_errors(400, "Email, nome e senha são obrigatórios"))
    }

    // Verifica se email já existe no banco
    conn("usuarios")
        .where("email", email)
        .first()
        .then(existing => {
            if (existing) {
                return next(http_errors(409, "Usuário já existe"))
            }

            // Insere novo usuário
            conn("usuarios")
                .insert({
                    email,
                    nome,
                    password,
                    provider: "local"
                })
                .then(dados => {
                    if (!dados) {
                        return next(http_errors(404, "Erro ao criar usuário"))
                    }
                    // Gera token automaticamente após registrar
                    const token = generateToken(dados[0], email)
                    res.status(201).json({
                        resposta: "Usuário criado com sucesso",
                        token,
                        usuario: { id: dados[0], email, nome }
                    })
                })
                .catch(next)
        })
        .catch(next)
})

// ==========================================
// AUTENTICAÇÃO: Login com email e senha
// POST /auth/login
// Body: { email, password }
// Retorna: token JWT válido por 7 dias
// ==========================================
api.post( "/auth/login" , (req, res, next) => {
    const { email, password } = req.body

    if (!email || !password) {
        return next(http_errors(400, "Email e senha são obrigatórios"))
    }

    // Busca usuário com esse email E essa senha
    conn("usuarios")
        .where("email", email)
        .where("password", password)
        .first()
        .then(usuario => {
            if (!usuario) {
                return next(http_errors(401, "Email ou senha incorretos"))
            }

            // Gera token para usar em requests autenticados
            const token = generateToken(usuario.id, usuario.email)
            res.json({
                resposta: "Login realizado com sucesso",
                token,
                usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome }
            })
        })
        .catch(next)
})

// ==========================================
// AUTENTICAÇÃO: Google OAuth2
// POST /auth/google/callback
// Simula callback do Google após autenticação
// Se usuário existe → login, Se não existe → registra
// ==========================================
api.post( "/auth/google/callback" , (req, res, next) => {
    const { googleId, email, nome } = req.body

    if (!googleId || !email) {
        return next(http_errors(400, "googleId e email são obrigatórios"))
    }

    // Verifica se usuário Google já tem conta
    conn("usuarios")
        .where("google_id", googleId)
        .first()
        .then(usuario => {
            if (usuario) {
                // Usuário já existe, faz login
                const token = generateToken(usuario.id, usuario.email)
                return res.json({
                    resposta: "Autenticação Google bem-sucedida",
                    token,
                    usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome }
                })
            }

            // Primeira vez: cria novo usuário com Google
            conn("usuarios")
                .insert({
                    google_id: googleId,
                    email,
                    nome,
                    provider: "google"
                })
                .then(dados => {
                    const token = generateToken(dados[0], email)
                    res.status(201).json({
                        resposta: "Usuário criado e autenticado com Google",
                        token,
                        usuario: { id: dados[0], email, nome }
                    })
                })
                .catch(next)
        })
        .catch(next)
})

// ==========================================
// LINKS: Listar todos (PÚBLICO - sem autenticação)
// GET /link
// Retorna: array de todos os links com suas categorias
// ==========================================
api.get( "/link" , (req, res, next) => {
    // JOIN com categoria pra pegar nome da categoria de cada link
    conn("links")
        .leftJoin("categoria" , "links.categoria_id" , "=" , "categoria.id")
        .select("links.*" , "categoria.nome AS categoria")
        .then( dados => {
            if (!dados || dados.length === 0) {
                return res.json([])  // Retorna array vazio se não tiver dados
            }
            res.json( dados )
        })
        .catch( next )
})

// ==========================================
// LINKS: Buscar link por ID (PÚBLICO)
// GET /link/:idLink
// Retorna: dados específicos do link solicitado
// ==========================================
api.get( "/link/:idLink" , (req, res, next) => {
    const id = req.params.idLink
    conn("links")
        .leftJoin("categoria" , "links.categoria_id" , "=" , "categoria.id")
        .select("links.*" , "categoria.nome AS categoria")
        .where( "links.id" , id )
        .first()
        .then( dados => res.json( dados ) )
        .catch( next )
})

// ==========================================
// LINKS: Criar novo link (REQUER AUTENTICAÇÃO)
// POST /link
// authMiddleware verifica token antes de executar
// Body: { url, titulo, categoria_id (opcional) }
// Retorna: ID do link criado
// IMPORTANTE: Link é associado ao usuário autenticado (req.user.userId)
// ==========================================
api.post( "/link" , authMiddleware , (req, res, next) => {
    conn("links")
        .insert({
            url: req.body.url,
            titulo: req.body.titulo,
            categoria_id: req.body.categoria_id || null,  // Aceita null (sem categoria)
            usuario_id: req.user.userId  // Associa link ao usuário autenticado
        })
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Erro ao inserir"))
            }
            res.status(201).json( {
                resposta : "Link inserido" ,
                id : dados[0]
            } )
        } )
        .catch( next )
})

// ==========================================
// LINKS: Atualizar link (REQUER AUTENTICAÇÃO)
// PUT /link/:idLink
// SEGURANÇA: Só pode atualizar seu próprio link
// Verifica usuario_id do link contra usuário autenticado
// ==========================================
api.put( "/link/:idLink" , authMiddleware , (req, res, next) => {
    const idLink = req.params.idLink
    
    // Atualiza APENAS se o link pertence ao usuário autenticado
    conn("links")
        .where( "id" , idLink )
        .where( "usuario_id" , req.user.userId )  // Segurança: só seu próprio link
        .update( req.body )
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Link não encontrado ou sem permissão"))
            }
            res.status(200).json( {
                resposta : "Link editado" 
            })
        } )
        .catch( next )
})

// ==========================================
// LINKS: Deletar link (REQUER AUTENTICAÇÃO)
// DELETE /link/:idLink
// SEGURANÇA: Só pode deletar seu próprio link
// ==========================================
api.delete( "/link/:idLink" , authMiddleware , (req, res, next) => {
    const id = req.params.idLink
    
    // Deleta APENAS se o link pertence ao usuário autenticado
    conn("links")
        .where( "id" , id )
        .where( "usuario_id" , req.user.userId )  // Segurança: só seu próprio link
        .delete()
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Erro ao excluir"))
            }
            res.status(200).json( {
                resposta : "Link excluído"
            } )
        }  )
        .catch( next )
})

// ==========================================
// CATEGORIAS: Listar todas (PÚBLICO)
// GET /categoria
// Retorna: array de todas as categorias
// ==========================================
api.get( "/categoria" , (req, res, next) => {
    conn("categoria")
        .then( dados => res.json( dados ) )
        .catch( next )
})

// ==========================================
// CATEGORIAS: Buscar categoria por ID (PÚBLICO)
// GET /categoria/:idCat
// Retorna: dados da categoria específica
// ==========================================
api.get( "/categoria/:idCat" , (req, res, next) => {
    const id = req.params.idCat
    conn("categoria")
        .where( "categoria.id" , id )
        .first()
        .then( dados => res.json( dados ) )
        .catch( next )
})

// ==========================================
// CATEGORIAS: Deletar categoria (PÚBLICO)
// DELETE /categoria/:idCat
// Qualquer um pode deletar categorias
// ==========================================
api.delete( "/categoria/:idCat" , (req, res, next) => {
    const id = req.params.idCat
    conn("categoria")
        .where( "id" , id )
        .delete()
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Erro ao excluir"))
            }
            res.status(200).json( {
                resposta : "Categoria excluída"
            } )
        }  )
        .catch( next )
})

// ==========================================
// CATEGORIAS: Criar nova categoria (PÚBLICO)
// POST /categoria
// Body: { nome }
// Retorna: ID da categoria criada
// ==========================================
api.post( "/categoria" , (req, res, next) => {
    conn("categoria")
        .insert( req.body )
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Erro ao inserir"))
            }
            res.status(201).json( {
                resposta : "Categoria inserida" ,
                id : dados[0]
            } )
        } )
        .catch( next )
})

// ==========================================
// CATEGORIAS: Atualizar categoria (PÚBLICO)
// PUT /categoria/:idCat
// Body: { nome }
// ==========================================
api.put( "/categoria/:idCat" , (req, res, next) => {
    const idCategoria = req.params.idCat
    conn("categoria")
        .where( "id" , idCategoria )
        .update( req.body )
        .then( dados => {
            if( !dados ){
                return next( http_errors( 404 , "Erro ao editar"))
            }
            res.status(200).json( {
                resposta : "Categoria editada" 
            })
        } )
        .catch( next )
})

// ==========================================
// INICIAR SERVIDOR
// ==========================================
api.listen( PORT , ()=>{
    console.log( `Servidor rodando em: http://${HOSTNAME}:${PORT}`)
})
