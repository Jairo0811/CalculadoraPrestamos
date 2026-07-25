import { ResultadosComponent } from "./components/resultados/resultados.component";
import { CalculadoraComponent } from "./components/calculadora/calculadora.component";
import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";

const routes: Routes = [
  { path: "", component: CalculadoraComponent },
  { path: "resultados", component: ResultadosComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
