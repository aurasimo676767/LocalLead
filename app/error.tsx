"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>Qualcosa non è andato a buon fine.</h2>
      <p>Il lavoro salvato è ancora nel tuo workspace.</p>
      <button className="button" onClick={reset}>
        Riprova
      </button>
    </div>
  );
}
