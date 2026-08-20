import { BrandLockup } from '../common/BrandLockup'

export function TmdbAttribution() {
  return (
    <footer className="tmdb-attribution">
      <div className="footer-brand">
        <BrandLockup />
        <p>Cinema, do assento à portaria.</p>
      </div>
      <div className="tmdb-credit">
        <img
          src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
          alt="TMDB"
          loading="lazy"
          decoding="async"
          width="61"
          height="9"
        />
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.{' '}
          <a href="https://www.themoviedb.org/">Saiba mais</a>
        </p>
      </div>
    </footer>
  )
}
