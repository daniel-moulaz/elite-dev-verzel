import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createOrganizerSession,
  getOrganizerSession,
  publishOrganizerSession,
  updateOrganizerSession,
  type CatalogMovie,
  type OrganizerSession,
  type SessionInput,
  type SessionUpdateInput,
} from '../../api'
import {
  formatPrice,
  formatSessionDate,
  movieYear,
  tmdbPosterUrl,
  toDateTimeLocalValue,
} from './formatters'
import { PosterImage } from '../common/PosterImage'
import { MoviePicker } from './MoviePicker'

interface SessionEditorProps {
  accessToken: string
  sessionId?: string
  onBack: () => void
}

interface SessionFormState {
  startsAt: string
  venueName: string
  roomName: string
  address: string
  price: string
  rows: string
  seatsPerRow: string
}

const emptyForm: SessionFormState = {
  startsAt: '',
  venueName: '',
  roomName: '',
  address: '',
  price: '',
  rows: '6',
  seatsPerRow: '10',
}

function formFromSession(session: OrganizerSession): SessionFormState {
  return {
    startsAt: toDateTimeLocalValue(session.startsAt),
    venueName: session.venueName,
    roomName: session.roomName,
    address: session.address,
    price: (session.priceCents / 100).toFixed(2),
    rows: String(session.rows),
    seatsPerRow: String(session.seatsPerRow),
  }
}

function movieFromSession(session: OrganizerSession): CatalogMovie {
  return {
    id: session.movie.tmdbId,
    title: session.movie.title,
    overview: session.movie.overview,
    posterPath: session.movie.posterPath,
    backdropPath: session.movie.backdropPath,
    releaseDate: session.movie.releaseDate,
    runtimeMinutes: session.movie.runtimeMinutes,
  }
}

function changesFromSession(
  session: OrganizerSession,
  input: SessionInput,
): SessionUpdateInput {
  const changes: SessionUpdateInput = {}

  if (input.tmdbMovieId !== session.movie.tmdbId) {
    changes.tmdbMovieId = input.tmdbMovieId
  }

  if (new Date(input.startsAt).getTime() !== new Date(session.startsAt).getTime()) {
    changes.startsAt = input.startsAt
  }

  if (input.venueName !== session.venueName) {
    changes.venueName = input.venueName
  }

  if (input.roomName !== session.roomName) {
    changes.roomName = input.roomName
  }

  if (input.address !== session.address) {
    changes.address = input.address
  }

  if (input.priceCents !== session.priceCents) {
    changes.priceCents = input.priceCents
  }

  if (
    input.rows !== session.rows ||
    input.seatsPerRow !== session.seatsPerRow
  ) {
    changes.rows = input.rows
    changes.seatsPerRow = input.seatsPerRow
  }

  return changes
}

function validateForm(
  form: SessionFormState,
  movie: CatalogMovie | null,
): SessionInput | string {
  if (!movie) {
    return 'Selecione um filme antes de salvar.'
  }

  const startsAt = new Date(form.startsAt)
  if (!form.startsAt || Number.isNaN(startsAt.getTime())) {
    return 'Informe uma data e hora válidas.'
  }

  if (startsAt.getTime() <= Date.now()) {
    return 'A sessão precisa começar no futuro.'
  }

  const price = Number(form.price)
  const rows = Number(form.rows)
  const seatsPerRow = Number(form.seatsPerRow)

  if (!Number.isFinite(price) || price < 0) {
    return 'Informe um preço válido, igual ou maior que zero.'
  }

  if (!Number.isInteger(rows) || rows < 1 || rows > 10) {
    return 'O layout deve ter entre 1 e 10 fileiras.'
  }

  if (
    !Number.isInteger(seatsPerRow) ||
    seatsPerRow < 1 ||
    seatsPerRow > 20
  ) {
    return 'Cada fileira deve ter entre 1 e 20 assentos.'
  }

  if (
    !form.venueName.trim() ||
    !form.roomName.trim() ||
    !form.address.trim()
  ) {
    return 'Preencha local, sala e endereço.'
  }

  return {
    tmdbMovieId: movie.id,
    startsAt: startsAt.toISOString(),
    venueName: form.venueName.trim(),
    roomName: form.roomName.trim(),
    address: form.address.trim(),
    priceCents: Math.round(price * 100),
    rows,
    seatsPerRow,
  }
}

interface RoomLayoutPreviewProps {
  rows: number
  seatsPerRow: number
}

function RoomLayoutPreview({ rows, seatsPerRow }: RoomLayoutPreviewProps) {
  const isValid =
    Number.isInteger(rows) &&
    rows >= 1 &&
    rows <= 10 &&
    Number.isInteger(seatsPerRow) &&
    seatsPerRow >= 1 &&
    seatsPerRow <= 20

  if (!isValid) {
    return (
      <div className="room-layout-preview room-layout-invalid">
        Informe um layout válido para visualizar a sala.
      </div>
    )
  }

  return (
    <div
      className="room-layout-preview"
      role="img"
      aria-label={`Prévia da sala com ${rows} fileiras e ${seatsPerRow} assentos por fileira`}
    >
      <div className="room-preview-screen" aria-hidden="true">Tela</div>
      <div className="room-preview-scroll" aria-hidden="true">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div className="room-preview-row" key={rowIndex}>
            <span>{String.fromCharCode(65 + rowIndex)}</span>
            <div
              className="room-preview-seats"
              style={{ gridTemplateColumns: `repeat(${seatsPerRow}, 0.65rem)` }}
            >
              {Array.from({ length: seatsPerRow }, (_, seatIndex) => (
                <i key={seatIndex} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface PublishedSessionProps {
  session: OrganizerSession
}

function PublishedSession({ session }: PublishedSessionProps) {
  const posterUrl = tmdbPosterUrl(session.movie.posterPath)

  return (
    <article className="published-session">
      <div className="published-movie">
        <PosterImage
          src={posterUrl}
          title={session.movie.title}
          className="published-movie-poster"
        />
        <div>
          <span className="status-badge status-published">Publicada</span>
          <h2>{session.movie.title}</h2>
          <p className="movie-meta">
            {movieYear(session.movie.releaseDate)}
            {session.movie.runtimeMinutes
              ? ` · ${session.movie.runtimeMinutes} min`
              : ''}
          </p>
          {session.movie.overview ? <p>{session.movie.overview}</p> : null}
        </div>
      </div>

      <dl className="published-facts">
        <div>
          <dt>Data e hora</dt>
          <dd>{formatSessionDate(session.startsAt)}</dd>
        </div>
        <div>
          <dt>Local</dt>
          <dd>{session.venueName}</dd>
        </div>
        <div>
          <dt>Sala</dt>
          <dd>{session.roomName}</dd>
        </div>
        <div>
          <dt>Endereço</dt>
          <dd>{session.address}</dd>
        </div>
        <div>
          <dt>Ingresso</dt>
          <dd>{formatPrice(session.priceCents)}</dd>
        </div>
        <div>
          <dt>Layout</dt>
          <dd>
            {session.rows} fileiras · {session.seatsPerRow} por fileira ·{' '}
            {session.capacity} lugares
          </dd>
        </div>
      </dl>

      <p className="locked-notice">
        <span aria-hidden="true">●</span>
        <span>
          <strong>Estrutura bloqueada após publicação.</strong>
          Filme, horário, local, preço e assentos não podem mais ser alterados.
        </span>
      </p>
    </article>
  )
}

export function SessionEditor({
  accessToken,
  sessionId,
  onBack,
}: SessionEditorProps) {
  const [session, setSession] = useState<OrganizerSession | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<CatalogMovie | null>(null)
  const [form, setForm] = useState<SessionFormState>(emptyForm)
  const [isLoading, setIsLoading] = useState(Boolean(sessionId))
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadRevision, setLoadRevision] = useState(0)

  useEffect(() => {
    if (!sessionId) {
      return
    }

    const controller = new AbortController()

    getOrganizerSession(accessToken, sessionId, controller.signal)
      .then((loadedSession) => {
        setSession(loadedSession)
        setSelectedMovie(movieFromSession(loadedSession))
        setForm(formFromSession(loadedSession))
        setIsDirty(false)
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setLoadError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Não foi possível carregar a sessão.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, loadRevision, sessionId])

  function updateField(field: keyof SessionFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setIsDirty(true)
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setNotice(null)

    const input = validateForm(form, selectedMovie)
    if (typeof input === 'string') {
      setActionError(input)
      return
    }

    setIsSaving(true)

    try {
      let savedSession: OrganizerSession

      if (session) {
        const changes = changesFromSession(session, input)

        if (Object.keys(changes).length === 0) {
          setIsDirty(false)
          setNotice('O rascunho já está atualizado.')
          return
        }

        savedSession = await updateOrganizerSession(
          accessToken,
          session.id,
          changes,
        )
      } else {
        savedSession = await createOrganizerSession(accessToken, input)
      }

      setSession(savedSession)
      setSelectedMovie(movieFromSession(savedSession))
      setForm(formFromSession(savedSession))
      setIsDirty(false)
      setNotice(
        session
          ? 'Rascunho atualizado com sucesso.'
          : 'Rascunho criado com sucesso. Agora você pode publicá-lo.',
      )
    } catch (saveError) {
      setActionError(
        saveError instanceof ApiError
          ? saveError.message
          : 'Não foi possível salvar o rascunho.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish() {
    if (!session) {
      return
    }

    setIsPublishing(true)
    setActionError(null)
    setNotice(null)

    try {
      const publishedSession = await publishOrganizerSession(
        accessToken,
        session.id,
      )
      setSession(publishedSession)
      setNotice('Sessão publicada. A estrutura agora está bloqueada.')
    } catch (publishError) {
      setActionError(
        publishError instanceof ApiError
          ? publishError.message
          : 'Não foi possível publicar a sessão.',
      )
    } finally {
      setIsPublishing(false)
    }
  }

  if (isLoading) {
    return (
      <section
        className="organizer-content content-state"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="section-kicker">Carregando</p>
        <h1>Abrindo a sessão…</h1>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="organizer-content content-state error-state">
        <p className="section-kicker">Sessão indisponível</p>
        <h1>Não foi possível abrir este rascunho</h1>
        <p role="alert">{loadError}</p>
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              setIsLoading(true)
              setLoadError(null)
              setLoadRevision((current) => current + 1)
            }}
          >
            Tentar novamente
          </button>
          <button type="button" className="secondary-button" onClick={onBack}>
            Voltar à lista
          </button>
        </div>
      </section>
    )
  }

  const isPublished = session?.status === 'PUBLISHED'
  const isBusy = isSaving || isPublishing
  const rows = Number(form.rows)
  const seatsPerRow = Number(form.seatsPerRow)
  const capacity =
    Number.isInteger(rows) &&
    rows >= 1 &&
    rows <= 10 &&
    Number.isInteger(seatsPerRow) &&
    seatsPerRow >= 1 &&
    seatsPerRow <= 20
      ? rows * seatsPerRow
      : 0
  return (
    <section className="organizer-content" aria-labelledby="editor-title">
      <button type="button" className="back-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Minhas sessões
      </button>

      <div className="page-heading editor-heading">
        <div>
          <p className="section-kicker">
            {session ? 'Gestão da sessão' : 'Nova programação'}
          </p>
          <h1 id="editor-title">
            {isPublished
              ? 'Detalhes da sessão'
              : session
                ? 'Editar rascunho'
                : 'Criar sessão'}
          </h1>
          <p>
            {isPublished
              ? 'Consulte os dados publicados em modo de leitura.'
              : 'Escolha o filme e configure apenas o necessário para a exibição.'}
          </p>
        </div>
        {session ? (
          <span
            className={`status-badge status-${session.status.toLowerCase()}`}
          >
            {isPublished ? 'Publicada' : 'Rascunho'}
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className="message success-message" role="status">
          {notice}
        </p>
      ) : null}

      {actionError ? (
        <p className="message error-message" role="alert">
          {actionError}
        </p>
      ) : null}

      {isPublished && session ? (
        <PublishedSession session={session} />
      ) : (
        <>
          <MoviePicker
            accessToken={accessToken}
            disabled={isBusy}
            selectedMovie={selectedMovie}
            onSelect={(movie) => {
              setSelectedMovie(movie)
              setIsDirty(true)
              setNotice(null)
            }}
          />

          <form
            className="session-form"
            aria-busy={isBusy}
            onSubmit={handleSubmit}
          >
            <div className="form-section-heading">
              <p className="section-kicker">Passo 2</p>
              <h2>Configure a exibição</h2>
            </div>

            <div className="form-grid">
              <div className="field field-wide">
                <label htmlFor="starts-at">Data e hora</label>
                <input
                  id="starts-at"
                  type="datetime-local"
                  value={form.startsAt}
                  disabled={isBusy}
                  onChange={(event) =>
                    updateField('startsAt', event.target.value)
                  }
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="venue-name">Cinema / local</label>
                <input
                  id="venue-name"
                  value={form.venueName}
                  disabled={isBusy}
                  onChange={(event) =>
                    updateField('venueName', event.target.value)
                  }
                  maxLength={120}
                  placeholder="Ex.: SEPTEM Paulista"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="room-name">Sala</label>
                <input
                  id="room-name"
                  value={form.roomName}
                  disabled={isBusy}
                  onChange={(event) =>
                    updateField('roomName', event.target.value)
                  }
                  maxLength={80}
                  placeholder="Ex.: Sala 2"
                  required
                />
              </div>

              <div className="field field-wide">
                <label htmlFor="address">Endereço</label>
                <input
                  id="address"
                  value={form.address}
                  disabled={isBusy}
                  onChange={(event) =>
                    updateField('address', event.target.value)
                  }
                  maxLength={240}
                  placeholder="Rua, número e cidade"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="price">Preço do ingresso (R$)</label>
                <input
                  id="price"
                  type="number"
                  value={form.price}
                  disabled={isBusy}
                  min="0"
                  max="100000"
                  step="0.01"
                  onChange={(event) => updateField('price', event.target.value)}
                  placeholder="30,00"
                  required
                />
              </div>
            </div>

            <fieldset className="layout-fieldset">
              <legend>Layout da sala</legend>
              <p>
                Os lugares serão gerados de A1 em diante. O layout poderá ser
                alterado somente enquanto a sessão for rascunho.
              </p>
              <div className="layout-configurator">
                <div className="layout-fields">
                  <div className="field">
                    <label htmlFor="rows">Fileiras</label>
                    <input
                      id="rows"
                      type="number"
                      value={form.rows}
                      disabled={isBusy}
                      min="1"
                      max="10"
                      onChange={(event) =>
                        updateField('rows', event.target.value)
                      }
                      required
                    />
                  </div>
                  <span aria-hidden="true">×</span>
                  <div className="field">
                    <label htmlFor="seats-per-row">Assentos por fileira</label>
                    <input
                      id="seats-per-row"
                      type="number"
                      value={form.seatsPerRow}
                      disabled={isBusy}
                      min="1"
                      max="20"
                      onChange={(event) =>
                        updateField('seatsPerRow', event.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="capacity-summary" aria-live="polite">
                    <strong>{capacity}</strong>
                    <span>lugares</span>
                  </div>
                </div>
                <RoomLayoutPreview rows={rows} seatsPerRow={seatsPerRow} />
              </div>
            </fieldset>

            <div className="editor-actions">
              <button type="submit" disabled={isBusy}>
                {isSaving
                  ? 'Salvando…'
                  : session
                    ? 'Salvar alterações'
                    : 'Salvar rascunho'}
              </button>
              {session ? (
                <div className="publish-action">
                  <p>Revise e salve qualquer alteração antes de publicar.</p>
                  <button
                    type="button"
                    className="publish-button"
                    onClick={() => void handlePublish()}
                    disabled={isBusy || isDirty}
                  >
                    {isPublishing ? 'Publicando…' : 'Publicar sessão'}
                  </button>
                </div>
              ) : null}
            </div>
          </form>
        </>
      )}
    </section>
  )
}
