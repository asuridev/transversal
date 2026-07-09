/**
 * Contrato de la consulta de información de contacto por documento (KYC),
 * expuesta por el BFF en `POST /api/journey/:slug/contact-info`. El envelope
 * `responseHeader` + `bodyResponse` refleja la forma que devuelve el proveedor
 * del journey (Mashery); hoy el BFF la mockea.
 */
export interface ContactInfoRequest {
  readonly documentType: string;
  readonly documentNumber: string;
}

export interface ContactInfoEmail {
  readonly email: string;
}

export interface ContactInfoPhone {
  readonly cellPhoneNumber: string;
  readonly indicative: string;
}

export interface PersonalInformation {
  readonly documentType: string;
  readonly documentNumber: string;
  readonly firstName: string;
  readonly secondName: string;
  readonly surname: string;
  readonly secondSurname: string;
  readonly birthDate: string;
  readonly gender: string;
  readonly civilStatus: string;
  readonly city: string;
  readonly dependents: string;
  readonly department: string;
  readonly nationality: string;
  readonly income: string;
  readonly emails: readonly ContactInfoEmail[];
  readonly cellPhoneNumber: readonly ContactInfoPhone[];
}

export interface ContactInfoResponse {
  readonly responseHeader: {
    readonly returnCode: number;
    readonly message: string;
  };
  readonly bodyResponse: {
    readonly personalInformation: PersonalInformation;
    readonly totalElement: number;
  };
}
