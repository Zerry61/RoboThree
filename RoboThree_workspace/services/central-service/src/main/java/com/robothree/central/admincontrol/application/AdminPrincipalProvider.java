package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminPrincipalSummary;

public interface AdminPrincipalProvider {
    AdminPrincipalSummary currentPrincipal();
}
