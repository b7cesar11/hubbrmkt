import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

function authRedirect(mode) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('auth', mode)
  return url.toString()
}

function friendlyAuthError(error) {
  const message = String(error?.message || '')
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (lower.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (lower.includes('user already registered')) return 'Já existe uma conta com este e-mail.'
  if (lower.includes('password should be at least')) return 'A senha não atende aos requisitos mínimos de segurança.'
  if (lower.includes('rate limit') || lower.includes('security purposes')) {
    return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.'
  }
  if (lower.includes('email address') && lower.includes('invalid')) return 'Informe um endereço de e-mail válido.'
  return message || 'Não foi possível concluir a operação. Tente novamente.'
}

function passwordChecks(password) {
  return [
    { label: '8 ou mais caracteres', ok: password.length >= 8 },
    { label: 'uma letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'uma letra minúscula', ok: /[a-z]/.test(password) },
    { label: 'um número', ok: /\d/.test(password) },
  ]
}

function Field({ icon: Icon, label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
        {children}
      </div>
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400'

export default function Login({ onLogin, initialMode = 'signin', onPasswordUpdated }) {
  const [mode, setMode] = useState(initialMode)
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  const checks = useMemo(() => passwordChecks(password), [password])
  const passwordIsStrong = checks.every((item) => item.ok)

  function clearFeedback() {
    setError(null)
    setInfo(null)
  }

  function changeMode(nextMode) {
    clearFeedback()
    setPassword('')
    setConfirmPassword('')
    setMode(nextMode)
  }

  async function handleSignIn(event) {
    event.preventDefault()
    clearFeedback()
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      onLogin(data.user)
    } catch (authError) {
      setError(friendlyAuthError(authError))
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(event) {
    event.preventDefault()
    clearFeedback()

    if (!fullName.trim() || !companyName.trim()) {
      setError('Informe seu nome e o nome da empresa/loja.')
      return
    }
    if (!passwordIsStrong) {
      setError('Crie uma senha que atenda a todos os requisitos de segurança.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: authRedirect('confirmed'),
          data: {
            full_name: fullName.trim(),
            company_name: companyName.trim(),
          },
        },
      })
      if (signUpError) throw signUpError

      if (data.session) {
        onLogin(data.user)
        return
      }

      setEmail(normalizedEmail)
      setMode('check-email')
    } catch (authError) {
      setError(friendlyAuthError(authError))
    } finally {
      setLoading(false)
    }
  }

  async function handleResendConfirmation() {
    clearFeedback()
    setLoading(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authRedirect('confirmed') },
      })
      if (resendError) throw resendError
      setInfo('E-mail de confirmação reenviado. Confira também a caixa de spam.')
    } catch (authError) {
      setError(friendlyAuthError(authError))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault()
    clearFeedback()
    setLoading(true)
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirect('recovery'),
      })
      if (recoveryError) throw recoveryError
      setInfo('Se existir uma conta com esse e-mail, enviaremos as instruções para redefinir a senha.')
    } catch (authError) {
      setError(friendlyAuthError(authError))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdatePassword(event) {
    event.preventDefault()
    clearFeedback()

    if (!passwordIsStrong) {
      setError('A nova senha precisa atender a todos os requisitos de segurança.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      window.history.replaceState({}, document.title, window.location.pathname)
      setPassword('')
      setConfirmPassword('')
      onPasswordUpdated?.()
    } catch (authError) {
      setError(friendlyAuthError(authError))
    } finally {
      setLoading(false)
    }
  }

  const isSignup = mode === 'signup'
  const isRecovery = mode === 'recovery'

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside className="hidden lg:flex lg:w-[44%] relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-slate-950 p-12 xl:p-16 text-white">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between w-full max-w-lg">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              MargemHub
            </div>
            <h1 className="mt-16 text-4xl xl:text-5xl font-bold leading-tight">
              Margem real para decidir melhor em cada marketplace.
            </h1>
            <p className="mt-6 text-blue-100 text-lg leading-relaxed">
              Centralize custos, taxas, promoções e regras comerciais em um único painel, com a origem de cada cálculo sempre visível.
            </p>
          </div>

          <div className="space-y-4 text-sm text-blue-50">
            {[
              'Margem por produto e canal',
              'Taxas oficiais, API e estimativas identificadas',
              'Dados separados e protegidos por empresa',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center gap-2 text-xl font-bold text-slate-900">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              MargemHub
            </div>
          </div>

          {mode === 'check-email' ? (
            <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-3xl p-7 sm:p-9 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                <Mail className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-slate-900">Confirme seu e-mail</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Enviamos um link de confirmação para <strong className="text-slate-800">{email}</strong>.
                Ao confirmar, você retorna ao MargemHub para continuar.
              </p>
              <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                O link precisa abrir o mesmo endereço público do MargemHub. Se ele apontar para localhost, a configuração de URL do ambiente ainda precisa ser publicada.
              </div>
              {error && <Feedback type="error">{error}</Feedback>}
              {info && <Feedback type="info">{info}</Feedback>}
              <button
                type="button"
                disabled={loading}
                onClick={handleResendConfirmation}
                className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? 'Reenviando…' : 'Reenviar e-mail'}
              </button>
              <button
                type="button"
                onClick={() => changeMode('signin')}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar para o login
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-3xl p-7 sm:p-9">
              <div className="mb-7">
                <p className="text-sm font-semibold text-blue-600">MargemHub</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  {isSignup
                    ? 'Crie sua conta'
                    : mode === 'forgot'
                      ? 'Recupere seu acesso'
                      : isRecovery
                        ? 'Defina uma nova senha'
                        : 'Acesse sua conta'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {isSignup
                    ? 'Comece criando o workspace da sua empresa ou loja.'
                    : mode === 'forgot'
                      ? 'Informe seu e-mail e enviaremos um link seguro de recuperação.'
                      : isRecovery
                        ? 'Escolha uma senha nova para continuar usando sua conta.'
                        : 'Entre para acompanhar suas margens e custos multicanal.'}
                </p>
              </div>

              <form
                onSubmit={
                  isSignup
                    ? handleSignUp
                    : mode === 'forgot'
                      ? handleForgotPassword
                      : isRecovery
                        ? handleUpdatePassword
                        : handleSignIn
                }
                className="space-y-4"
              >
                {isSignup && (
                  <>
                    <Field icon={UserRound} label="Seu nome">
                      <input
                        className={`${inputClass} pl-10`}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Nome e sobrenome"
                        autoComplete="name"
                        required
                      />
                    </Field>
                    <Field icon={Building2} label="Empresa ou loja">
                      <input
                        className={`${inputClass} pl-10`}
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Nome da sua operação"
                        autoComplete="organization"
                        required
                      />
                    </Field>
                  </>
                )}

                {!isRecovery && (
                  <Field icon={Mail} label="E-mail profissional">
                    <input
                      type="email"
                      className={`${inputClass} pl-10`}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="voce@empresa.com.br"
                      autoComplete="email"
                      required
                    />
                  </Field>
                )}

                {mode !== 'forgot' && (
                  <Field icon={LockKeyhole} label={isRecovery ? 'Nova senha' : 'Senha'}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`${inputClass} pl-10 pr-11`}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••••••"
                      autoComplete={isSignup ? 'new-password' : isRecovery ? 'new-password' : 'current-password'}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </Field>
                )}

                {(isSignup || isRecovery) && (
                  <>
                    <Field icon={LockKeyhole} label="Confirme a senha">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`${inputClass} pl-10`}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                      {checks.map((item) => (
                        <div
                          key={item.label}
                          className={`flex items-center gap-1.5 text-[11px] ${item.ok ? 'text-green-700' : 'text-slate-500'}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {mode === 'signin' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => changeMode('forgot')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}

                {error && <Feedback type="error">{error}</Feedback>}
                {info && <Feedback type="info">{info}</Feedback>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? 'Processando…'
                    : isSignup
                      ? 'Criar minha conta'
                      : mode === 'forgot'
                        ? 'Enviar link de recuperação'
                        : isRecovery
                          ? 'Salvar nova senha'
                          : 'Entrar no MargemHub'}
                </button>
              </form>

              {isSignup && (
                <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">
                  Ao continuar, você cria um workspace exclusivo para a sua empresa. Nunca compartilhe sua senha ou links de acesso.
                </p>
              )}

              <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
                {mode === 'signin' ? (
                  <p>
                    Ainda não usa o MargemHub?{' '}
                    <button onClick={() => changeMode('signup')} className="font-semibold text-blue-600 hover:text-blue-800">
                      Criar conta
                    </button>
                  </p>
                ) : mode === 'signup' ? (
                  <p>
                    Já possui conta?{' '}
                    <button onClick={() => changeMode('signin')} className="font-semibold text-blue-600 hover:text-blue-800">
                      Fazer login
                    </button>
                  </p>
                ) : !isRecovery ? (
                  <button
                    type="button"
                    onClick={() => changeMode('signin')}
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar para o login
                  </button>
                ) : null}
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Seus dados operacionais são isolados por empresa e protegidos por políticas de acesso.
          </p>
        </div>
      </main>
    </div>
  )
}

function Feedback({ type, children }) {
  const isError = type === 'error'
  return (
    <div
      className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
        isError
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-blue-200 bg-blue-50 text-blue-700'
      }`}
    >
      {children}
    </div>
  )
}
