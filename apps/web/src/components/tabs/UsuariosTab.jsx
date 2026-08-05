import React from 'react'
import { supabase } from '../../lib/supabase'

export function UsuariosTab({ companyUsers, setCompanyUsers, companyId, userRole }) {
  return (
    <>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Usuários</h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900 font-medium mb-1">Código da empresa</p>
              <p className="text-xs text-blue-700 mb-2">
                Compartilhe esse código com quem precisa acessar — a pessoa cria a própria conta
                (tela de login → "Criar conta") e cola esse código quando pedido.
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-white px-3 py-1.5 rounded border border-blue-200 text-xs flex-1 overflow-x-auto">
                  {companyId}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(companyId)
                    alert('Código copiado!')
                  }}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                >
                  Copiar
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-mail</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Papel</th>
                      {(userRole === 'company_admin' || userRole === 'super_admin') && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {companyUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3">
                          {
                            {
                              super_admin: 'Super Admin',
                              company_admin: 'Administrador',
                              operator: 'Operador',
                              viewer: 'Visualizador',
                            }[u.role] || u.role
                          }
                        </td>
                        {(userRole === 'company_admin' || userRole === 'super_admin') && (
                          <td className="px-4 py-3">
                            {u.role !== 'super_admin' && (
                              <select
                                value={u.role}
                                onChange={async (e) => {
                                  const { error } = await supabase.rpc('fn_update_user_role', {
                                    target_user_id: u.id,
                                    new_role: e.target.value,
                                  })
                                  if (error) {
                                    alert('Erro ao mudar papel: ' + error.message)
                                    return
                                  }
                                  setCompanyUsers(
                                    companyUsers.map((cu) =>
                                      cu.id === u.id ? { ...cu, role: e.target.value } : cu
                                    )
                                  )
                                }}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value="company_admin">Administrador</option>
                                <option value="operator">Operador</option>
                                <option value="viewer">Visualizador</option>
                              </select>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              ⚠️ Hoje só duas coisas têm restrição de verdade por papel: mudar o papel de alguém
              (só Administrador/Super Admin) e mexer em Regras de Taxa/Promoções (só Super Admin).
              Todo o resto (produtos, custos adicionais) qualquer pessoa da empresa pode
              criar/editar, independente do papel escolhido aqui — isso é uma pendência, não uma
              garantia real ainda.
            </p>
          </div>
    </>
  )
}
