"use client";

import { ContactModal } from "@/components/crm/contact-modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { Contact } from "@/types";
import { Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";

interface Props {
  organizationId: string;
  contact: Contact | null;
  /** `viewer` é somente leitura: enxerga o card, não recebe o botão. */
  canEdit: boolean;
}

/** Card "Contato" do detalhe da negociação, com edição no mesmo lugar. */
export function DealContactCard({ organizationId, contact, canEdit }: Props) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Contato"
        action={
          canEdit && contact ? (
            <Button
              size="sm"
              variant="ghost"
              // Texto compacto como no card de tags, mas com 40px de alvo de
              // toque; o -my-1 impede que o header cresça por causa disso.
              className="-my-1 min-h-10"
              onClick={() => setEditOpen(true)}
            >
              Editar contato
            </Button>
          ) : undefined
        }
      />
      {contact ? (
        <div className="space-y-2.5 px-5 py-4 text-sm">
          <div className="flex items-center gap-2.5">
            <Avatar name={contact.name} src={contact.avatar_url} size="sm" />
            <span className="font-semibold text-ink">{contact.name}</span>
          </div>
          {contact.email && (
            <p className="flex items-center gap-2 break-all text-ink-soft">
              <Mail className="h-4 w-4 shrink-0 text-ink-faint" />
              {contact.email}
            </p>
          )}
          {(contact.whatsapp_phone || contact.phone) && (
            <p className="flex items-center gap-2 text-ink-soft">
              <Phone className="h-4 w-4 shrink-0 text-ink-faint" />
              {contact.whatsapp_phone ?? contact.phone}
            </p>
          )}
          {(contact.city || contact.state) && (
            <p className="flex items-center gap-2 text-ink-soft">
              <MapPin className="h-4 w-4 shrink-0 text-ink-faint" />
              {[contact.city, contact.state].filter(Boolean).join(" / ")}
            </p>
          )}
          {!contact.email && !contact.whatsapp_phone && !contact.phone && (
            <p className="text-xs text-ink-faint">
              Sem e-mail ou telefone cadastrado.
              {canEdit ? " Complete os dados para conseguir falar com o lead." : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-faint">
          Nenhum contato vinculado. Use &quot;Editar&quot; na negociação para vincular um.
        </p>
      )}

      {contact && (
        <ContactModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          organizationId={organizationId}
          contact={contact}
        />
      )}
    </Card>
  );
}
