/**
 * Quelltext des Lesezeichens, das Inseratsdaten aus dem Browser in die App bringt.
 *
 * Läuft auf der Inseratsseite - dort sind die Daten erreichbar, anders als bei einem
 * Server-Abruf, den ImmobilienScout24 mit HTTP 401 abweist.
 *
 * Es wird bewusst NICHT gesendet, sondern navigiert: Chrome blockiert Anfragen von einer
 * öffentlichen HTTPS-Seite an lokale Adressen (Private Network Access). Gemessen - ein
 * fetch auf http://localhost:3000 scheitert dort mit "Failed to fetch", selbst mit
 * gesetztem Access-Control-Allow-Private-Network, während ein öffentliches Ziel antwortet.
 * Eine normale Navigation ist davon nicht betroffen.
 *
 * Die Daten reisen im URL-Fragment (#). Das wird nicht an den Server übertragen und landet
 * in keinem Zugriffsprotokoll - die Seite /erfassen liest es im Browser aus.
 *
 * Quellen der Werte, an echten Seiten gemessen:
 *   1. JSON-LD `RealEstateListing` (IS24 in einem @graph, immowelt direkt) - Titel, Adresse, Preis
 *   2. window.IS24.expose - Exposé-Nummer und Preis
 *   3. CSS-Klassen und dt/dd-Kriterientabelle - Fläche, Erschließung, Bebaubarkeit
 */
export function buildBookmarklet(origin: string): string {
  const source = `
(function(){
  function txt(sel){ var e=document.querySelector(sel); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null; }
  function byLabel(label){
    var n=document.querySelectorAll('dt');
    for(var i=0;i<n.length;i++){
      if(n[i].textContent.trim().toLowerCase().indexOf(label.toLowerCase())===0){
        var dd=n[i].nextElementSibling;
        if(dd) return dd.textContent.trim().replace(/\\s+/g,' ');
      }
    }
    return null;
  }
  function num(s){
    if(s===null||s===undefined) return null;
    var m=String(s).replace(/[^0-9.,]/g,'').replace(/\\.(?=\\d{3}\\b)/g,'').replace(',','.');
    var v=parseFloat(m);
    return isFinite(v)&&v>0?v:null;
  }

  var listing=null;
  var scripts=document.querySelectorAll('script[type="application/ld+json"]');
  for(var i=0;i<scripts.length && !listing;i++){
    try{
      var d=JSON.parse(scripts[i].textContent);
      var kn=d['@graph']||(Array.isArray(d)?d:[d]);
      for(var j=0;j<kn.length;j++){
        var t=kn[j]&&kn[j]['@type'];
        var ty=Array.isArray(t)?t:[t];
        for(var k=0;k<ty.length;k++){
          if(typeof ty[k]==='string' && /RealEstateListing|Residence|Product|Offer/i.test(ty[k])){ listing=kn[j]; break; }
        }
        if(listing) break;
      }
    }catch(e){}
  }

  var adresse=null;
  if(listing&&listing.address&&typeof listing.address==='object'){
    var a=listing.address;
    adresse=[a.streetAddress,[a.postalCode,a.addressLocality].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  var ldPreis=listing&&listing.offers?(listing.offers.price||(listing.offers[0]&&listing.offers[0].price)):null;
  var ex=(window.IS24&&window.IS24.expose)||{};

  var daten={
    url: location.href,
    exposeId: ex.id||null,
    title: (listing&&typeof listing.name==='string'?listing.name:null)||txt('#expose-title')||txt('h1')||document.title,
    address: adresse||txt('[data-qa="is24-expose-address"]')||txt('.address-text')||txt('.address-block'),
    price: num(ldPreis)||num(ex.propertyPrice)||num(txt('.is24qa-kaufpreis'))||num(txt('#viewad-price'))||num(byLabel('Kaufpreis')),
    areaSqm: num(txt('.is24qa-grundstueck-ca'))||num(byLabel('Grundstücksfläche'))||num(byLabel('Grundstück')),
    developmentStatus: txt('.is24qa-erschliessung')||byLabel('Erschließung'),
    buildingLaw: txt('.is24qa-bebaubar-nach')||byLabel('Bebaubar nach'),
    broker: {
      name: txt('[data-qa="contactName"]')||txt('.is24-ex-contact-name'),
      company: txt('[data-qa="companyName"]')||txt('.is24qa-company-name'),
      phone: txt('.is24qa-phone'),
      email: null
    }
  };

  if(!daten.price && !daten.areaSqm){
    alert('Auf dieser Seite wurden keine Inseratsdaten gefunden.\\n\\nBist du auf einer Exposé-Seite?');
    return;
  }

  // btoa verträgt kein UTF-8 direkt - Umweg über encodeURIComponent.
  var kodiert=btoa(unescape(encodeURIComponent(JSON.stringify(daten))));
  window.open('${origin}/erfassen#'+kodiert,'_blank');
})();`.trim()

  const compact = source.split('\n').map(line => line.trim()).join('')
  return 'javascript:' + encodeURIComponent(compact)
}
