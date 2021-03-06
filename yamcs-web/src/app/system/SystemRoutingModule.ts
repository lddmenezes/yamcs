import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { TablesPage } from './tables/TablesPage';
import { TablePage } from './table/TablePage';
import { StreamsPage } from './streams/StreamsPage';
import { StreamPage } from './stream/StreamPage';

import { InstanceExistsGuard } from '../core/guards/InstanceExistsGuard';
import { SystemPage } from './template/SystemPage';
import { ServicesPage } from './services/ServicesPage';
import { LinksPage } from './links/LinksPage';
import { ClientsPage } from './clients/ClientsPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { TableColumnsTab } from './table/TableColumnsTab';
import { TableDataTab } from './table/TableDataTab';
import { TableScriptTab } from './table/TableScriptTab';
import { StreamColumnsTab } from './stream/StreamColumnsTab';
import { StreamScriptTab } from './stream/StreamScriptTab';
import { ProcessorsPage } from './processors/ProcessorsPage';
import { ProcessorPage } from './processors/ProcessorPage';
import { ProcessorTCTab } from './processors/ProcessorTCTab';
import { ProcessorTMTab } from './processors/ProcessorTMTab';

const routes = [
  {
    path: '',
    canActivate: [InstanceExistsGuard],
    component: SystemPage,
    children: [
      {
        path: 'dashboard',
        component: DashboardPage,
      },
      {
        path: 'clients',
        component: ClientsPage,
      },
      {
        path: 'links',
        component: LinksPage,
      },
      {
        path: 'processors',
        pathMatch: 'full',
        component: ProcessorsPage,
      },
      {
        path: 'processors/:name',
        component: ProcessorPage,
        children: [
          {
            path: '',
            redirectTo: 'tm',
          }, {
            path: 'tm',
            component: ProcessorTMTab,
          }, {
            path: 'tc',
            component: ProcessorTCTab,
          }
        ],
      },
      {
        path: 'tables',
        pathMatch: 'full',
        component: TablesPage,
      },
      {
        path: 'tables/:name',
        component: TablePage,
        children: [
          {
            path: '',
            redirectTo: 'columns',
          }, {
            path: 'columns',
            component: TableColumnsTab,
          }, {
            path: 'data',
            component: TableDataTab,
          }, {
            path: 'script',
            component: TableScriptTab,
          }
        ],
      },
      {
        path: 'streams',
        component: StreamsPage,
        pathMatch: 'full',
      },
      {
        path: 'streams/:name',
        component: StreamPage,
        children: [
          {
            path: '',
            redirectTo: 'columns',
          }, {
            path: 'columns',
            component: StreamColumnsTab,
          }, {
            path: 'script',
            component: StreamScriptTab,
          }
        ],
      },
      {
        path: 'services',
        component: ServicesPage,
      },
    ]
  }
];

@NgModule({
  imports: [ RouterModule.forChild(routes) ],
  exports: [ RouterModule ],
})
export class SystemRoutingModule { }

export const routingComponents = [
  ClientsPage,
  DashboardPage,
  LinksPage,
  ProcessorsPage,
  ProcessorPage,
  ProcessorTCTab,
  ProcessorTMTab,
  ServicesPage,
  StreamsPage,
  StreamPage,
  StreamColumnsTab,
  StreamScriptTab,
  SystemPage,
  TablesPage,
  TablePage,
  TableColumnsTab,
  TableDataTab,
  TableScriptTab,
];
