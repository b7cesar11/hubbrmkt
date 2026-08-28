import React from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export function ToastCenter({ messages, onDismiss }) {
  return (
    <div className="fixed inset-x-4 top-20 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite" aria-atomic="true">
      {messages.map((message) => {
        const error = message.type === 'error'
        const Icon = error ? AlertCircle : CheckCircle2
        return (
          <div key={message.id} className={`flex w-full items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${error ? 'border-red-200' : 'border-emerald-200'}`}>
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${error ? 'text-red-600' : 'text-emerald-600'}`} />
            <p className="flex-1 text-sm leading-5 text-slate-700">{message.text}</p>
            <button type="button" onClick={() => onDismiss(message.id)} aria-label="Fechar notificação" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        )
      })}
    </div>
  )
}
