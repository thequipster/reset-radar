// Theme-specific, static assets: no filters, SVG animation or frame loop.
import darkBrand from '../assets/ui/radar-emblem.webp';
import lightBrand from '../assets/ui/radar-emblem-light.svg';
import darkCard from '../assets/ui/reset-card-art.webp';
import lightCard from '../assets/ui/reset-card-art-light.svg';
export function RadarBrand({size=30,className=''}:{size?:number;className?:string}) {
 return <span className={`rr-themed-art ${className}`} data-radar-art="brand" style={{width:size,height:size}} aria-hidden="true"><img className="rr-art-dark" src={darkBrand} width={size} height={size} alt=""/><img className="rr-art-light" src={lightBrand} width={size} height={size} alt=""/></span>;
}
export function ResetCardArtwork({className=''}:{className?:string}) {
 return <span className={`rr-themed-art ${className}`} data-radar-art="card" style={{width:104,height:72}} aria-hidden="true"><img className="rr-art-dark" src={darkCard} width="104" height="72" alt=""/><img className="rr-art-light" src={lightCard} width="104" height="72" alt=""/></span>;
}
