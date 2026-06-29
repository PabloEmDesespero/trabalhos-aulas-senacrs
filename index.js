const express = require("express")
const knex = require("knex")
const http_errors = require("http-errors")
const jwt = require("jsonwebtoken")

const PORT = 8001
const HOSTNAME = "localhost"
const JWT_SECRET = "seu_secret_jwt_aqui"

const api = express()
api.use( express.json() )
api.use( express.urlencoded( { extended : true } ) )

const conn = knex( {
    client : "mysql" ,
    connection : {
        host : HOSTNAME ,
        user : "root" ,
        password : "" ,
        database : "loja_26_1"
    }
} )

function generateToken(userId, email) {
    return jwt.sign(
        { userId, email },
        JWT_SECRET,
        { expiresIn: "7d" }
    )
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET)
    } catch (err) {
        return null
    }
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization
    
    if (!authHeader) {
        return next(http_errors(401, "Token não fornecido"))
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader
    const decoded = verifyToken(token)

    if (!decoded) {
        return next(http_errors(401, "Token inválido ou expirado"))
    }

    req.user = decoded
    next()
}

api.get( "/" , (req, res, next) => {
    res.json( { resposta : 'Seja bem-vindo(a) à nossa API de Links' } )
} )

api.post( "/auth/register" , (req, res, next) => {
    const { email, password, nome } = req.body

    if (!email || !password || !nome) {
        return next(http_errors(400, "Email, nome e senha são obrigatórios"))
    }

    conn("usuarios")
        .where("email", email)
        .first()
        .then(existing => {
            if (existing) {
                return next(http_errors(409, "Usuário já existe"))
            }

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

api.post( "/auth/login" , (req, res, next) => {
    const { email, password } = req.body

    if (!email || !password) {
        return next(http_errors(400, "Email e senha são obrigatórios"))
    }

    conn("usuarios")
        .where("email", email)
        .where("password", password)
        .first()
        .then(usuario => {
            if (!usuario) {
                return next(http_errors(401, "Email ou senha incorretos"))
            }

            const token = generateToken(usuario.id, usuario.email)
            res.json({
                resposta: "Login realizado com sucesso",
                token,
                usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome }
            })
        })
        .catch(next)
})

api.post( "/auth/google/callback" , (req, res, next) => {
    const { googleId, email, nome } = req.body

    if (!googleId || !email) {
        return next(http_errors(400, "googleId e email são obrigatórios"))
    }

    conn("usuarios")
        .where("google_id", googleId)
        .first()
        .then(usuario => {
            if (usuario) {
                // Usuário já existe
                const token = generateToken(usuario.id, usuario.email)
                return res.json({
                    resposta: "Autenticação Google bem-sucedida",
                    token,
                    usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome }
                })
            }

            // Criar novo usuário
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

api.get( "/link" , (req, res, next) => {
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

api.post( "/link" , authMiddleware , (req, res, next) => {
    conn("links")
        .insert({
            url: req.body.url,
            titulo: req.body.titulo,
            categoria_id: req.body.categoria_id || null,  // Aceita null
            usuario_id: req.user.userId
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

api.put( "/link/:idLink" , authMiddleware , (req, res, next) => {
    const idLink = req.params.idLink
    
    conn("links")
        .where( "id" , idLink )
        .where( "usuario_id" , req.user.userId )
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

api.delete( "/link/:idLink" , authMiddleware , (req, res, next) => {
    const id = req.params.idLink
    conn("links")
        .where( "id" , id )
        .where( "usuario_id" , req.user.userId )
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

api.get( "/categoria" , (req, res, next) => {
    conn("categoria")
        .then( dados => res.json( dados ) )
        .catch( next )
})

api.get( "/categoria/:idCat" , (req, res, next) => {
    const id = req.params.idCat
    conn("categoria")
        .where( "categoria.id" , id )
        .first()
        .then( dados => res.json( dados ) )
        .catch( next )
})

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

api.listen( PORT , ()=>{
    console.log( `Servidor rodando em: http://${HOSTNAME}:${PORT}`)
})