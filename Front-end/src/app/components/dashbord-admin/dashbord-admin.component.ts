import { Component, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';

import { Ticket } from 'src/app/models/Ticket.model';
import { Comment } from 'src/app/models/Comment.model';
import { Project } from 'src/app/models/Project.model';
import { StatusColumn } from 'src/app/models/StatusColumn.model';

import { DashboardService } from 'src/app/services/dashboard.service';
import { TicketService } from 'src/app/services/ticket.service';

import { TicketDetailsComponent } from '../ticket-details/ticket-details.component';

import { LogTimeDialogComponent } from '../log-time-dialog/log-time-dialog.component';

type BackendStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'VALIDATED';

@Component({
  selector: 'app-dashboard-admin',
  templateUrl: './dashbord-admin.component.html',
  styleUrls: ['./dashbord-admin.component.scss']
})
export class DashboardadminComponent implements OnInit {

  statusColumns: StatusColumn[] = [
    { key: 'TODO', label: 'TO DO', color: '#f8f9fa', tickets: [], disabled: true },
    { key: 'IN_PROGRESS', label: 'IN PROGRESS', color: '#fff3cd', tickets: [], disabled: true },
    { key: 'IN_REVIEW', label: 'IN REVIEW', color: '#e2e3ff', tickets: [], disabled: true },
    { key: 'DONE', label: 'DONE', color: '#d4edda', tickets: [], disabled: false },
    { key: 'VALIDATED', label: 'VALIDATED', color: '#d1ecf1', tickets: [], disabled: false }
  ];

  statusMapping: { [key in Ticket['status']]: BackendStatus } = {
    TODO: 'TODO',
    IN_PROGRESS: 'IN_PROGRESS',
    IN_REVIEW: 'IN_REVIEW',
    DONE: 'DONE',
    VALIDATED: 'VALIDATED'
  };

  projects: Project[] = [];
  selectedProject?: Project;
  selectedTicketId: number | null = null;

  commentsByTicket: { [ticketId: number]: Comment[] } = {};
  newCommentText = '';

  isAdmin = false;
  isEmployee = false;

  isLoading = false;
  error: string | null = null;

  constructor(
    private dashboardService: DashboardService,
    private ticketService: TicketService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadProjects();
    this.isAdmin = true;
    this.isEmployee = true;

   
    this.statusColumns.forEach(col => {
      col.disabled = !this.isAdmin && col.key !== 'DONE' && col.key !== 'VALIDATED';
    });
  }

  loadProjects(): void {
    this.dashboardService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        if (projects.length > 0) {
          this.selectedProject = projects[0];
          this.loadTickets();
        }
      },
      error: (err) => console.error('Erreur projets', err)
    });
  }

  onProjectChange(): void {
    this.loadTickets();
  }

  loadTickets(): void {
    if (!this.selectedProject) return;

    this.isLoading = true;
    this.dashboardService.getProjectById(this.selectedProject.id).subscribe({
      next: (project) => {
        const tickets = (project as any).tickets || [];
        this.distributeTickets(tickets);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Erreur tickets', err);
        this.isLoading = false;
      }
    });
  }
// Méthode pour vérifier si le temps de travail loggé dépasse le temps estimé
  isTimeExceeded(ticket: Ticket): boolean {
    if (!ticket.estimatedTime || !ticket.workedTimeHours) {
      return false;
    }
    
   
    if (ticket.status === 'DONE' || ticket.status === 'VALIDATED') {
      return false;
    }


    const estimatedHours = parseFloat(ticket.estimatedTime);
    if (isNaN(estimatedHours)) return false;

    
    const workedHours = ticket.workedTimeHours;
    
    return workedHours > estimatedHours;
  }
  distributeTickets(tickets: Ticket[]): void {
    const backendToFrontendStatus: { [key in BackendStatus]: Ticket['status'] } = {
      TODO: 'TODO',
      IN_PROGRESS: 'IN_PROGRESS',
      IN_REVIEW: 'IN_REVIEW',
      DONE: 'DONE',
      VALIDATED: 'VALIDATED'
    };

    this.statusColumns.forEach(col => col.tickets = []);

    tickets.forEach(ticket => {
      const backendStatus = ticket.status as BackendStatus;
      const frontendStatus = backendToFrontendStatus[backendStatus];
      const col = this.statusColumns.find(c => c.key === frontendStatus);
      if (col) {
        col.tickets.push({ ...ticket, status: frontendStatus });
      } else {
        console.warn(`Statut non reconnu : ${ticket.status}`);
      }
    });
  }

  onTicketClick(ticketId: number): void {
    this.ticketService.getTicketById(ticketId).subscribe(ticket => {
      this.dialog.open(TicketDetailsComponent, {
        width: '400px',
        data: ticket
      });
    });
  }



  getComments(ticketId: number): void {
    this.selectedTicketId = ticketId;
    this.dashboardService.getComments(ticketId).subscribe({
      next: (comments) => this.commentsByTicket[ticketId] = comments,
      error: (err) => console.error('Erreur commentaires', err)
    });
  }


  onDrop(event: CdkDragDrop<Ticket[]>, targetStatus: Ticket['status']): void {
    const ticket = event.previousContainer.data[event.previousIndex];
    const oldStatus = ticket.status;

    if (targetStatus === 'VALIDATED' && !this.isAdmin) {
      alert("Seul un administrateur peut valider un ticket.");
      this.loadTickets();
      return;
    }

    if (targetStatus === 'VALIDATED') {
      this.dashboardService.validateTicket(ticket.id).subscribe({
        next: () => this.loadTickets(),
        error: () => {
          console.error('Erreur validation');
          ticket.status = oldStatus;
          this.loadTickets();
        }
      });
      return;
    }

    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      ticket.status = targetStatus;
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);

      const backendStatus = this.statusMapping[targetStatus];
      this.dashboardService.updateTicketStatus(ticket.id, backendStatus).subscribe({
        next: () => console.log('Statut mis à jour'),
        error: (err) => {
          console.error('Erreur statut', err);
          ticket.status = oldStatus;
          this.loadTickets();
        }
      });
    }
  }

  refreshTickets(): void {
    this.loadTickets();
  }

  formatDate(date: Date | undefined): string {
    return date ? new Date(date).toLocaleDateString('fr-FR') : '';
  }

  finishSprint(): void {
    console.log('Sprint terminé');
  }
  openLogTimeDialog(ticket: Ticket): void {

  const estimated = ticket.estimatedTime ?? 8;

  const dialogRef = this.dialog.open(LogTimeDialogComponent, {
    width: '400px',
    data: { ticketId: ticket.id, estimatedTime: estimated }
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result != null) {
      console.log("Temps saisi :", result, "heures");
      alert("✅ Temps enregistré !");
    
    }
  });
}



showTicketPopup = false;
showCommentPopup = false;
selectedTicket: any = null;


// Méthode pour ajouter un commentaire
addComment(ticketId: number, content: string): void {
  if (!content.trim()) return;

  this.dashboardService.addComment(ticketId, content).subscribe({
    next: (response) => {
    
      this.newCommentText = '';
      
      
      this.getComments(ticketId);
      
      console.log('Commentaire ajouté avec succès');
    },
    error: (err) => {
      console.error('Erreur ajout commentaire', err);
    }
  });
}


// Vérifier si un ticket a des commentaires
hasComments(ticketId: any): boolean {
  return this.commentsByTicket[ticketId] && this.commentsByTicket[ticketId].length > 0;
}

// Ouvrir la popup de détails du ticket
openTicketPopup(ticket: any): void {
  console.log('Ticket sélectionné:', ticket);
  this.selectedTicket = ticket;
  this.showTicketPopup = true;
  this.showCommentPopup = false;
  
  
  if (!this.commentsByTicket[ticket.id]) {
    this.getComments(ticket.id);
  }
}


openCommentPopup(ticket: any): void {
  this.selectedTicket = ticket;
  this.showCommentPopup = true;
  this.showTicketPopup = false;
  

  if (!this.commentsByTicket[ticket.id]) {
    this.getComments(ticket.id);
  }
}

// Ouvrir la popup de commentaires depuis la popup de détails
openCommentPopupFromDetails(): void {
  if (this.selectedTicket) {
    this.showTicketPopup = false;
    this.showCommentPopup = true;
    
 
    if (!this.commentsByTicket[this.selectedTicket.id]) {
      this.getComments(this.selectedTicket.id);
    }
  }
}


closeTicketPopup(): void {
  this.showTicketPopup = false;

}

closeCommentPopup(): void {
  this.showCommentPopup = false;
  
  this.newCommentText = '';

  if (!this.showTicketPopup) {
    this.selectedTicket = null;
  }
}


closeAllPopups(): void {
  this.showTicketPopup = false;
  this.showCommentPopup = false;
  this.selectedTicket = null;
  this.newCommentText = '';
}

// Méthode pour naviguer de la popup commentaires vers la popup détails
backToTicketDetails(): void {
  if (this.selectedTicket) {
    this.showCommentPopup = false;
    this.showTicketPopup = true;
    this.newCommentText = '';
  }
}

}